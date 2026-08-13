import { db, dbWs } from "@superset/db/client";
import {
	type FactoryStage,
	factories,
	factoryItems,
	factoryRuns,
	type SelectFactory,
	type SelectFactoryItem,
	type SelectFactoryRun,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { dispatchStageQueued } from "./queue";
import { isAgentStage, STAGE_FLOW, STAGE_RESULT_SCHEMAS } from "./stages";
import { mirrorStageToTask } from "./tasks-mirror";

export async function getFactoryForOrg(
	organizationId: string,
	factoryId: string,
): Promise<SelectFactory> {
	const [factory] = await db
		.select()
		.from(factories)
		.where(
			and(
				eq(factories.id, factoryId),
				eq(factories.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!factory) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Factory not found" });
	}
	return factory;
}

export async function getItemForOrg(
	organizationId: string,
	itemId: string,
): Promise<SelectFactoryItem> {
	const [item] = await db
		.select()
		.from(factoryItems)
		.where(
			and(
				eq(factoryItems.id, itemId),
				eq(factoryItems.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!item) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
	}
	return item;
}

export interface ReportRunInput {
	organizationId: string;
	runId: string;
	expectedRevision: number;
	outcome: "success" | "blocked";
	result?: unknown;
	rationale: string;
	/** Set when a human records the report on the agent's behalf. */
	actorUserId?: string;
}

export interface ReportRunOutcome {
	itemId: string;
	stage: FactoryStage;
	revision: number;
	/** Set when autoAdvance dispatched the next stage. */
	autoDispatched?: FactoryStage;
}

/**
 * The single write path that moves an item forward: validates the stage
 * result, CAS-advances the item, and closes out the run. Called by the
 * factory_report MCP tool (agent) and the factory.report procedure (human
 * fallback). autoAdvance factories then dispatch the next agent stage.
 */
export async function reportFactoryRun(
	input: ReportRunInput,
): Promise<ReportRunOutcome> {
	const [run] = await db
		.select()
		.from(factoryRuns)
		.where(
			and(
				eq(factoryRuns.id, input.runId),
				eq(factoryRuns.organizationId, input.organizationId),
			),
		)
		.limit(1);
	if (!run) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
	}
	if (run.status === "reported") {
		throw new TRPCError({ code: "CONFLICT", message: "Run already reported" });
	}
	if (!isAgentStage(run.stage)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Stage ${run.stage} is not agent-reportable`,
		});
	}

	let result: unknown;
	if (input.outcome === "success") {
		const parsed = STAGE_RESULT_SCHEMAS[run.stage].safeParse(input.result);
		if (!parsed.success) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `result does not match the ${run.stage} stage schema: ${parsed.error.message}`,
			});
		}
		result = parsed.data;
	}

	const itemPatch = buildItemPatch(run, input.outcome, result, input.rationale);
	const [moved] = await dbWs
		.update(factoryItems)
		.set({
			...itemPatch,
			revision: sql`${factoryItems.revision} + 1`,
		})
		.where(
			and(
				eq(factoryItems.id, run.itemId),
				eq(factoryItems.revision, input.expectedRevision),
			),
		)
		.returning({ stage: factoryItems.stage, revision: factoryItems.revision });
	if (!moved) {
		const current = await getItemForOrg(input.organizationId, run.itemId);
		throw new TRPCError({
			code: "CONFLICT",
			message: `Item changed since dispatch (stage=${current.stage}, revision=${current.revision}). Only retry if your work is still the pending one.`,
		});
	}

	await dbWs
		.update(factoryRuns)
		.set({
			status: "reported",
			outcome: input.outcome,
			resultJson: result ?? null,
			rationale: input.rationale,
			actorUserId: input.actorUserId ?? null,
			reportedAt: new Date(),
		})
		.where(eq(factoryRuns.id, run.id));

	await mirrorStageToTask(run.itemId, moved.stage);
	const autoDispatched = await maybeAutoAdvance(run, input.outcome, moved);
	return {
		itemId: run.itemId,
		stage: moved.stage,
		revision: moved.revision,
		...(autoDispatched ? { autoDispatched } : {}),
	};
}

/**
 * autoAdvance factories dispatch the next agent stage right after a
 * successful report. Best-effort: a dispatch failure lands on the ledger
 * (dispatchFactoryStage records it), never on the report that triggered it.
 * The report itself is already committed by the time this runs.
 */
async function maybeAutoAdvance(
	run: SelectFactoryRun,
	outcome: "success" | "blocked",
	moved: { stage: FactoryStage; revision: number },
): Promise<FactoryStage | null> {
	if (outcome !== "success" || !isAgentStage(moved.stage)) return null;
	// human_review is the gate: never auto-dispatched (verify comes after a
	// human or the merged-PR webhook advances the item).
	const [factory] = await db
		.select()
		.from(factories)
		.where(eq(factories.id, run.factoryId))
		.limit(1);
	if (!factory?.autoAdvance || !factory.enabled) return null;

	const [item] = await db
		.select()
		.from(factoryItems)
		.where(eq(factoryItems.id, run.itemId))
		.limit(1);
	if (!item) return null;

	const result = await dispatchStageQueued({
		factory,
		item,
		stage: moved.stage,
		expectedRevision: moved.revision,
	});
	return result === "failed" ? null : moved.stage;
}

function buildItemPatch(
	run: SelectFactoryRun,
	outcome: "success" | "blocked",
	result: unknown,
	rationale: string,
): Partial<typeof factoryItems.$inferInsert> {
	if (outcome === "blocked") {
		return { blockedReason: rationale };
	}

	const next = STAGE_FLOW[run.stage];
	const patch: Partial<typeof factoryItems.$inferInsert> = {
		blockedReason: null,
		...(next ? { stage: next, stageEnteredAt: new Date() } : {}),
	};

	// Copy-ups: only what the board filters/renders on.
	if (run.stage === "classify") {
		const r = result as { kind: string; confidence: number };
		patch.kind = r.kind;
		patch.confidence = Math.round(r.confidence);
	}
	if (run.stage === "implement") {
		const r = result as { prNumber: number; prUrl: string };
		patch.prNumber = r.prNumber;
		patch.prUrl = r.prUrl;
	}
	return patch;
}
