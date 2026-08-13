import { mintUserJwt } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import {
	factoryImproveRuns,
	factoryRuns,
	factoryStagePrompts,
	type SelectFactory,
	users,
} from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNotNull, max, or } from "drizzle-orm";
import { pickOnlineHost, resolveCandidateHosts } from "../automation/dispatch";
import { RelayDispatchError, relayMutation } from "../automation/relay-client";
import { resolveActiveStagePrompt } from "./dispatch";
import { type AgentStage, renderImprovePrompt } from "./stages";

type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

/**
 * The learning signal for a stage: reported runs a human flagged (outcome
 * flawed, or any feedback note), newer than the active custom prompt so a
 * fresh version starts with a clean slate.
 */
export async function gatherFlawedRuns(factoryId: string, stage: AgentStage) {
	const [activeCustom] = await db
		.select({ createdAt: factoryStagePrompts.createdAt })
		.from(factoryStagePrompts)
		.where(
			and(
				eq(factoryStagePrompts.factoryId, factoryId),
				eq(factoryStagePrompts.stage, stage),
				eq(factoryStagePrompts.status, "active"),
			),
		)
		.limit(1);

	return db
		.select({
			id: factoryRuns.id,
			outcome: factoryRuns.outcome,
			rationale: factoryRuns.rationale,
			resultJson: factoryRuns.resultJson,
			feedbackNote: factoryRuns.feedbackNote,
			error: factoryRuns.error,
		})
		.from(factoryRuns)
		.where(
			and(
				eq(factoryRuns.factoryId, factoryId),
				eq(factoryRuns.stage, stage),
				eq(factoryRuns.status, "reported"),
				or(
					eq(factoryRuns.outcome, "flawed"),
					isNotNull(factoryRuns.feedbackNote),
				),
				activeCustom
					? gt(factoryRuns.createdAt, activeCustom.createdAt)
					: undefined,
			),
		)
		.orderBy(desc(factoryRuns.createdAt))
		.limit(20);
}

export type ImproveDispatchOutcome =
	| { status: "dispatched"; improveRunId: string }
	| { status: "skipped_offline"; improveRunId: string; error: string }
	| { status: "dispatch_failed"; improveRunId: string | null; error: string };

/**
 * Dispatch the improve meta-agent for one stage: fresh workspace on an
 * online host, prompt = current stage prompt + flagged runs, reporting via
 * factory_propose_prompt. Always records a factory_improve_runs row.
 */
export async function dispatchImproveRun(args: {
	factory: SelectFactory;
	stage: AgentStage;
	relayUrl: string;
}): Promise<ImproveDispatchOutcome> {
	const { factory, stage, relayUrl } = args;
	const agent = factory.stageConfig[stage]?.agent ?? factory.defaultAgent;

	const flawed = await gatherFlawedRuns(factory.id, stage);
	if (flawed.length === 0) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"No flagged runs to learn from — mark runs flawed (or leave feedback) first.",
		});
	}

	const recordRun = async (
		status: "dispatching" | "skipped_offline" | "dispatch_failed",
		error?: string,
		hostId?: string | null,
	) => {
		const [row] = await dbWs
			.insert(factoryImproveRuns)
			.values({
				factoryId: factory.id,
				organizationId: factory.organizationId,
				stage,
				sourceRunIds: flawed.map((run) => run.id),
				hostId: hostId ?? null,
				status,
				error: error ?? null,
			})
			.returning({ id: factoryImproveRuns.id });
		if (!row) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "failed to record improve run",
			});
		}
		return row;
	};

	const candidates = await resolveCandidateHosts(factory);
	const host =
		candidates.length > 0
			? await pickOnlineHost(factory, relayUrl, candidates)
			: null;
	if (!host) {
		const error =
			candidates.length === 0 ? "no host available" : "target host offline";
		const run = await recordRun(
			"skipped_offline",
			error,
			candidates[0]?.machineId,
		);
		return { status: "skipped_offline", improveRunId: run.id, error };
	}

	const run = await recordRun("dispatching", undefined, host.machineId);
	let workspaceId: string | null = null;
	try {
		const [owner] = await dbWs
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, factory.ownerUserId))
			.limit(1);
		const jwt = await mintUserJwt({
			userId: factory.ownerUserId,
			email: owner?.email,
			organizationIds: [factory.organizationId],
			scope: "factory-improve",
			runId: run.id,
			ttlSeconds: 300,
		});
		const routingKey = buildHostRoutingKey(
			factory.organizationId,
			host.machineId,
		);

		const current = await resolveActiveStagePrompt(factory.id, stage);
		const prompt = renderImprovePrompt({
			stage,
			improveRunId: run.id,
			repoFullName: factory.repoFullName,
			currentPrompt: current.content,
			flawedRuns: flawed,
		});

		const timestamp = new Date()
			.toISOString()
			.slice(0, 19)
			.replace(/[T:]/g, "-");
		const created = await relayMutation<
			{ projectId: string; name: string; branch: string },
			{ workspace: { id: string } }
		>(
			{ relayUrl, hostId: routingKey, jwt, timeoutMs: 90_000 },
			"workspaces.create",
			{
				projectId: factory.v2ProjectId,
				name: `Factory improve: ${stage}`,
				branch: `factory-improve-${stage}-${timestamp}`,
			},
		);
		workspaceId = created.workspace.id;

		const result = await relayMutation<
			{ workspaceId: string; agent: string; prompt: string },
			AgentRunResult
		>({ relayUrl, hostId: routingKey, jwt }, "agents.run", {
			workspaceId,
			agent,
			prompt,
		});

		await dbWs
			.update(factoryImproveRuns)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				chatSessionId: result.kind === "chat" ? result.sessionId : null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				v2WorkspaceId: workspaceId,
				dispatchedAt: new Date(),
			})
			.where(eq(factoryImproveRuns.id, run.id));
	} catch (err) {
		const error =
			err instanceof RelayDispatchError || err instanceof Error
				? err.message
				: "unknown error";
		await dbWs
			.update(factoryImproveRuns)
			.set({
				status: "dispatch_failed",
				error,
				...(workspaceId ? { v2WorkspaceId: workspaceId } : {}),
			})
			.where(eq(factoryImproveRuns.id, run.id));
		return { status: "dispatch_failed", improveRunId: run.id, error };
	}

	return { status: "dispatched", improveRunId: run.id };
}

/**
 * The factory_propose_prompt write path: turns a dispatched improve run
 * into a DRAFT prompt version. Never activates — humans do that.
 */
export async function proposePromptForImproveRun(input: {
	organizationId: string;
	improveRunId: string;
	content: string;
	rationale: string;
}): Promise<{ promptVersionId: string; version: number; stage: string }> {
	const [run] = await db
		.select()
		.from(factoryImproveRuns)
		.where(
			and(
				eq(factoryImproveRuns.id, input.improveRunId),
				eq(factoryImproveRuns.organizationId, input.organizationId),
			),
		)
		.limit(1);
	if (!run) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Improve run not found",
		});
	}
	if (run.status === "reported") {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Improve run already reported",
		});
	}

	return dbWs.transaction(async (tx) => {
		const [latest] = await tx
			.select({ version: max(factoryStagePrompts.version) })
			.from(factoryStagePrompts)
			.where(
				and(
					eq(factoryStagePrompts.factoryId, run.factoryId),
					eq(factoryStagePrompts.stage, run.stage),
				),
			);
		const [draft] = await tx
			.insert(factoryStagePrompts)
			.values({
				factoryId: run.factoryId,
				stage: run.stage,
				version: (latest?.version ?? 0) + 1,
				content: input.content,
				status: "draft",
				authoredBy: "agent",
				sourceRunIds: run.sourceRunIds,
			})
			.returning();
		if (!draft) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "failed to create draft prompt version",
			});
		}
		await tx
			.update(factoryImproveRuns)
			.set({
				status: "reported",
				proposedPromptVersionId: draft.id,
				rationale: input.rationale,
				reportedAt: new Date(),
			})
			.where(eq(factoryImproveRuns.id, run.id));
		return {
			promptVersionId: draft.id,
			version: draft.version,
			stage: draft.stage,
		};
	});
}
