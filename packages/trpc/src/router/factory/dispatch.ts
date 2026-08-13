import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	factoryItems,
	factoryRuns,
	factoryStagePrompts,
	type SelectFactory,
	type SelectFactoryItem,
	users,
} from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, desc, eq, sql } from "drizzle-orm";
import { pickOnlineHost, resolveCandidateHosts } from "../automation/dispatch";
import { RelayDispatchError, relayMutation } from "../automation/relay-client";
import {
	type AgentStage,
	DEFAULT_STAGE_PROMPTS,
	renderStageDispatchPrompt,
} from "./stages";

type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

export type StageDispatchOutcome =
	| { status: "dispatched"; runId: string }
	| { status: "skipped_offline"; runId: string | null; error: string }
	| { status: "dispatch_failed"; runId: string | null; error: string }
	| { status: "conflict"; error: string };

export interface StageDispatchOptions {
	factory: SelectFactory;
	item: SelectFactoryItem;
	stage: AgentStage;
	/** items.revision the caller read; the CAS move into the stage checks it. */
	expectedRevision: number;
	relayUrl: string;
}

/**
 * Run one pipeline stage for one item: CAS-move the item into the stage,
 * create a workspace on an online host, start the stage agent. Writes a
 * factory_runs row regardless of outcome. Advancement past the stage
 * happens only via factory.report (agent) or a manual transition — never
 * here. (Mastra anti-lesson: validate agent config and fail loudly; a
 * silent stall is the worst outcome.)
 */
export async function dispatchFactoryStage(
	opts: StageDispatchOptions,
): Promise<StageDispatchOutcome> {
	const { factory, item, stage, expectedRevision, relayUrl } = opts;

	const stageConfig = factory.stageConfig[stage];
	const agent = stageConfig?.agent ?? factory.defaultAgent;
	if (!agent) {
		return {
			status: "dispatch_failed",
			runId: null,
			error: "no agent configured for stage",
		};
	}

	const candidates = await resolveCandidateHosts(factory);
	const host =
		candidates.length > 0
			? await pickOnlineHost(factory, relayUrl, candidates)
			: null;
	if (!host) {
		const error =
			candidates.length === 0 ? "no host available" : "target host offline";
		// Record the attempt so the ledger shows why nothing happened.
		const [skipped] = await dbWs
			.insert(factoryRuns)
			.values({
				itemId: item.id,
				factoryId: factory.id,
				organizationId: factory.organizationId,
				stage,
				attempt: await nextAttempt(item.id, stage),
				hostId: candidates[0]?.machineId ?? null,
				status: "skipped_offline",
				error,
			})
			.onConflictDoNothing({
				target: [factoryRuns.itemId, factoryRuns.stage, factoryRuns.attempt],
			})
			.returning({ id: factoryRuns.id });
		return { status: "skipped_offline", runId: skipped?.id ?? null, error };
	}

	const prompt = await resolveActiveStagePrompt(factory.id, stage);
	const attempt = await nextAttempt(item.id, stage);

	const [run] = await dbWs
		.insert(factoryRuns)
		.values({
			itemId: item.id,
			factoryId: factory.id,
			organizationId: factory.organizationId,
			stage,
			attempt,
			promptVersionId: prompt.versionId,
			hostId: host.machineId,
			status: "dispatching",
		})
		.onConflictDoNothing({
			target: [factoryRuns.itemId, factoryRuns.stage, factoryRuns.attempt],
		})
		.returning();
	if (!run) {
		return {
			status: "conflict",
			error: "a run for this stage is already being dispatched",
		};
	}

	// Move the item into the stage. The revision check makes a concurrent
	// human transition (or double-click) lose cleanly instead of racing.
	const [moved] = await dbWs
		.update(factoryItems)
		.set({
			stage,
			revision: sql`${factoryItems.revision} + 1`,
			stageEnteredAt: new Date(),
			blockedReason: null,
		})
		.where(
			and(
				eq(factoryItems.id, item.id),
				eq(factoryItems.revision, expectedRevision),
			),
		)
		.returning({ revision: factoryItems.revision });
	if (!moved) {
		const error = "item changed since you read it";
		await markRunFailed(run.id, error);
		return { status: "conflict", error };
	}

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
			scope: "factory-run",
			runId: run.id,
			ttlSeconds: 300,
		});
		const routingKey = buildHostRoutingKey(
			factory.organizationId,
			host.machineId,
		);

		const priorResults = await successfulPriorResults(item.id);
		const fullPrompt = renderStageDispatchPrompt({
			stagePrompt: prompt.content,
			stage,
			runId: run.id,
			itemId: item.id,
			expectedRevision: moved.revision,
			repoFullName: factory.repoFullName,
			externalNumber: item.externalNumber,
			externalUrl: item.externalUrl,
			title: item.title,
			priorResults,
		});

		workspaceId = await createStageWorkspace({
			relayUrl,
			hostId: routingKey,
			jwt,
			projectId: factory.v2ProjectId,
			item,
			stage,
		});

		const result = await relayMutation<
			{
				workspaceId: string;
				agent: string;
				prompt: string;
				model?: string;
			},
			AgentRunResult
		>({ relayUrl, hostId: routingKey, jwt }, "agents.run", {
			workspaceId,
			agent,
			prompt: fullPrompt,
			...(stageConfig?.model ? { model: stageConfig.model } : {}),
		});

		await dbWs
			.update(factoryRuns)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				chatSessionId: result.kind === "chat" ? result.sessionId : null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				v2WorkspaceId: workspaceId,
				dispatchedAt: new Date(),
			})
			.where(eq(factoryRuns.id, run.id));
	} catch (err) {
		const error = describeError(err);
		await markRunFailed(run.id, error, workspaceId);
		// Surface on the board; the item stays in the stage it wedged in.
		await dbWs
			.update(factoryItems)
			.set({
				blockedReason: `dispatch failed: ${error}`,
				revision: sql`${factoryItems.revision} + 1`,
			})
			.where(eq(factoryItems.id, item.id));
		return { status: "dispatch_failed", runId: run.id, error };
	}

	return { status: "dispatched", runId: run.id };
}

export async function resolveActiveStagePrompt(
	factoryId: string,
	stage: AgentStage,
): Promise<{ content: string; versionId: string | null }> {
	const [active] = await dbWs
		.select({
			id: factoryStagePrompts.id,
			content: factoryStagePrompts.content,
		})
		.from(factoryStagePrompts)
		.where(
			and(
				eq(factoryStagePrompts.factoryId, factoryId),
				eq(factoryStagePrompts.stage, stage),
				eq(factoryStagePrompts.status, "active"),
			),
		)
		.limit(1);
	if (active) return { content: active.content, versionId: active.id };
	return { content: DEFAULT_STAGE_PROMPTS[stage], versionId: null };
}

async function nextAttempt(itemId: string, stage: AgentStage): Promise<number> {
	const [latest] = await dbWs
		.select({ attempt: factoryRuns.attempt })
		.from(factoryRuns)
		.where(and(eq(factoryRuns.itemId, itemId), eq(factoryRuns.stage, stage)))
		.orderBy(desc(factoryRuns.attempt))
		.limit(1);
	return (latest?.attempt ?? 0) + 1;
}

/** Latest successful result per stage, oldest stage first, for prompt context. */
async function successfulPriorResults(
	itemId: string,
): Promise<Array<{ stage: string; resultJson: unknown }>> {
	const rows = await dbWs
		.select({
			stage: factoryRuns.stage,
			resultJson: factoryRuns.resultJson,
			createdAt: factoryRuns.createdAt,
		})
		.from(factoryRuns)
		.where(
			and(eq(factoryRuns.itemId, itemId), eq(factoryRuns.outcome, "success")),
		)
		.orderBy(factoryRuns.createdAt);
	const latestByStage = new Map<
		string,
		{ stage: string; resultJson: unknown }
	>();
	for (const row of rows) {
		latestByStage.set(row.stage, {
			stage: row.stage,
			resultJson: row.resultJson,
		});
	}
	return [...latestByStage.values()];
}

async function markRunFailed(
	runId: string,
	error: string,
	workspaceId?: string | null,
): Promise<void> {
	await dbWs
		.update(factoryRuns)
		.set({
			status: "dispatch_failed",
			error,
			...(workspaceId ? { v2WorkspaceId: workspaceId } : {}),
		})
		.where(eq(factoryRuns.id, runId));
}

async function createStageWorkspace(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string;
	item: SelectFactoryItem;
	stage: AgentStage;
}): Promise<string> {
	const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
	const slug = slugifyForBranch(args.item.title, 24);
	const candidate = sanitizeBranchNameWithMaxLength(
		`factory-${args.item.externalNumber}-${args.stage}${slug ? `-${slug}` : ""}-${timestamp}`,
		60,
	);
	const branch = deduplicateBranchName(candidate, []);
	const name =
		`Factory #${args.item.externalNumber} ${args.stage}: ${args.item.title}`.slice(
			0,
			100,
		);

	const result = await relayMutation<
		{ projectId: string; name: string; branch: string },
		{ workspace: { id: string } }
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			// Worktree setup on big repos takes real time.
			timeoutMs: 90_000,
		},
		"workspaces.create",
		{ projectId: args.projectId, name, branch },
	);
	return result.workspace.id;
}

function describeError(err: unknown): string {
	if (err instanceof RelayDispatchError) return err.message;
	if (err instanceof Error) return err.message;
	return "unknown error";
}
