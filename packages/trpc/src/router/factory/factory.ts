import { db, dbWs } from "@superset/db/client";
import {
	factories,
	factoryImproveRuns,
	factoryItems,
	factoryRuns,
	factoryStagePrompts,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import {
	and,
	count,
	desc,
	eq,
	gte,
	isNotNull,
	isNull,
	max,
	notInArray,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { resolveUserRelayUrl } from "../../lib/relay-url";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { dispatchFactoryStage } from "./dispatch";
import { getFactoryForOrg, getItemForOrg, reportFactoryRun } from "./helpers";
import {
	dispatchImproveRun,
	gatherFlawedRuns,
	proposePromptForImproveRun,
} from "./improve";
import {
	createFactorySchema,
	intakeSchema,
	reportRunSchema,
	runStageSchema,
	setRunFeedbackSchema,
	setStagePromptSchema,
	transitionItemSchema,
	updateFactorySchema,
} from "./schema";
import {
	AGENT_STAGES,
	type AgentStage,
	DEFAULT_STAGE_PROMPTS,
	isAgentStage,
	STAGE_FLOW,
} from "./stages";
import { mirrorStageToTask } from "./tasks-mirror";

async function verifyHostAccess(
	userId: string,
	organizationId: string,
	hostId: string,
): Promise<void> {
	const [membership] = await db
		.select({ hostId: v2UsersHosts.hostId })
		.from(v2UsersHosts)
		.innerJoin(
			v2Hosts,
			and(
				eq(v2Hosts.organizationId, v2UsersHosts.organizationId),
				eq(v2Hosts.machineId, v2UsersHosts.hostId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.userId, userId),
				eq(v2UsersHosts.organizationId, organizationId),
				eq(v2UsersHosts.hostId, hostId),
			),
		)
		.limit(1);
	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You don't have access to this host",
		});
	}
}

/** The stage runStage may dispatch for an item: retry current, or advance. */
function resolveDispatchStage(
	itemStage: string,
	requested: AgentStage | undefined,
): AgentStage {
	const retry = isAgentStage(itemStage as AgentStage)
		? (itemStage as AgentStage)
		: null;
	const advanceTo = STAGE_FLOW[itemStage as keyof typeof STAGE_FLOW];
	const advance = advanceTo && isAgentStage(advanceTo) ? advanceTo : null;

	const target = requested ?? retry ?? advance;
	if (!target || (target !== retry && target !== advance)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Cannot dispatch ${requested ?? "a stage"} for an item in ${itemStage}`,
		});
	}
	return target;
}

export const factoryRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select()
			.from(factories)
			.where(eq(factories.organizationId, organizationId))
			.orderBy(desc(factories.createdAt));
	}),

	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getFactoryForOrg(organizationId, input.id);
		}),

	create: protectedProcedure
		.input(createFactorySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}
			const [factory] = await dbWs
				.insert(factories)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					name: input.name,
					v2ProjectId: input.v2ProjectId,
					repoFullName: input.repoFullName,
					targetHostId: input.targetHostId ?? null,
					defaultAgent: input.defaultAgent,
					stageConfig: input.stageConfig ?? {},
				})
				.returning();
			return factory;
		}),

	update: protectedProcedure
		.input(updateFactorySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const factory = await getFactoryForOrg(organizationId, input.id);
			if (factory.ownerUserId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the factory owner can edit it",
				});
			}
			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}
			const { id, ...rest } = input;
			const patch = Object.fromEntries(
				Object.entries(rest).filter(([, value]) => value !== undefined),
			);
			if (Object.keys(patch).length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Nothing to update",
				});
			}
			const [updated] = await dbWs
				.update(factories)
				.set(patch)
				.where(eq(factories.id, id))
				.returning();
			return updated;
		}),

	/** Board data: non-archived items plus the latest run per item. */
	listItems: protectedProcedure
		.input(z.object({ factoryId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getFactoryForOrg(organizationId, input.factoryId);

			const items = await db
				.select()
				.from(factoryItems)
				.where(
					and(
						eq(factoryItems.factoryId, input.factoryId),
						isNull(factoryItems.archivedAt),
					),
				)
				.orderBy(desc(factoryItems.stageEnteredAt));

			const latestRuns = await db
				.selectDistinctOn([factoryRuns.itemId], {
					itemId: factoryRuns.itemId,
					stage: factoryRuns.stage,
					status: factoryRuns.status,
					outcome: factoryRuns.outcome,
					error: factoryRuns.error,
					v2WorkspaceId: factoryRuns.v2WorkspaceId,
					terminalSessionId: factoryRuns.terminalSessionId,
					chatSessionId: factoryRuns.chatSessionId,
					createdAt: factoryRuns.createdAt,
				})
				.from(factoryRuns)
				.where(eq(factoryRuns.factoryId, input.factoryId))
				.orderBy(factoryRuns.itemId, desc(factoryRuns.createdAt));

			return { items, latestRuns };
		}),

	/** The evidence chain: item + all runs, newest first. */
	getItem: protectedProcedure
		.input(z.object({ itemId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const item = await getItemForOrg(organizationId, input.itemId);
			const runs = await db
				.select()
				.from(factoryRuns)
				.where(eq(factoryRuns.itemId, input.itemId))
				.orderBy(desc(factoryRuns.createdAt));
			return { item, runs };
		}),

	/** Manual intake (phase 1). Materialization keys make re-adds no-ops. */
	intake: protectedProcedure
		.input(intakeSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const factory = await getFactoryForOrg(organizationId, input.factoryId);

			const inserted = await dbWs
				.insert(factoryItems)
				.values(
					input.issues.map((issue) => ({
						factoryId: factory.id,
						organizationId,
						source: issue.source,
						externalNumber: issue.number,
						externalUrl: issue.url,
						title: issue.title,
						authorLogin: issue.authorLogin ?? null,
						materializationKey: `repo:${factory.repoFullName}:${issue.source}:${issue.number}`,
					})),
				)
				.onConflictDoNothing({
					target: [factoryItems.factoryId, factoryItems.materializationKey],
				})
				.returning({ id: factoryItems.id });

			return {
				created: inserted.length,
				skipped: input.issues.length - inserted.length,
			};
		}),

	/** Dispatch a stage agent for an item (phase 1's "Run" button). */
	runStage: protectedProcedure
		.input(runStageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const item = await getItemForOrg(organizationId, input.itemId);
			const factory = await getFactoryForOrg(organizationId, item.factoryId);
			if (!factory.enabled) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Factory is paused",
				});
			}
			const stage = resolveDispatchStage(item.stage, input.stage);

			const outcome = await dispatchFactoryStage({
				factory,
				item,
				stage,
				expectedRevision: input.expectedRevision,
				relayUrl: await resolveUserRelayUrl(factory.ownerUserId),
			});

			if (outcome.status === "conflict") {
				throw new TRPCError({ code: "CONFLICT", message: outcome.error });
			}
			if (outcome.status === "dispatch_failed") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: outcome.error,
				});
			}
			if (outcome.status === "skipped_offline") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: outcome.error,
				});
			}
			return { runId: outcome.runId, stage };
		}),

	/** Human fallback for factory_report (agent lacked the MCP tool, etc.). */
	report: protectedProcedure
		.input(reportRunSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return reportFactoryRun({
				organizationId,
				runId: input.runId,
				expectedRevision: input.expectedRevision,
				outcome: input.outcome,
				result: input.result,
				rationale: input.rationale,
				actorUserId: ctx.session.user.id,
			});
		}),

	/**
	 * Human board move (reject, mark merged, drag back). Recorded as a
	 * "manual" run row so the evidence chain shows every movement with
	 * attribution.
	 */
	transitionItem: protectedProcedure
		.input(transitionItemSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const item = await getItemForOrg(organizationId, input.itemId);

			const [moved] = await dbWs
				.update(factoryItems)
				.set({
					stage: input.toStage,
					stageEnteredAt: new Date(),
					blockedReason: null,
					revision: sql`${factoryItems.revision} + 1`,
					...(input.toStage === "done" || input.toStage === "rejected"
						? { archivedAt: null }
						: {}),
				})
				.where(
					and(
						eq(factoryItems.id, input.itemId),
						eq(factoryItems.revision, input.expectedRevision),
					),
				)
				.returning({ revision: factoryItems.revision });
			if (!moved) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Item changed since you read it",
				});
			}

			const [latest] = await db
				.select({ attempt: max(factoryRuns.attempt) })
				.from(factoryRuns)
				.where(
					and(
						eq(factoryRuns.itemId, item.id),
						eq(factoryRuns.stage, input.toStage),
					),
				);
			await dbWs.insert(factoryRuns).values({
				itemId: item.id,
				factoryId: item.factoryId,
				organizationId,
				stage: input.toStage,
				attempt: (latest?.attempt ?? 0) + 1,
				status: "reported",
				outcome: "manual",
				rationale:
					input.note ?? `manually moved from ${item.stage} to ${input.toStage}`,
				actorUserId: ctx.session.user.id,
				reportedAt: new Date(),
			});

			await mirrorStageToTask(item.id, input.toStage);
			return { revision: moved.revision };
		}),

	/** Post-hoc human judgment on a run — the self-improvement signal. */
	setRunFeedback: protectedProcedure
		.input(setRunFeedbackSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [updated] = await dbWs
				.update(factoryRuns)
				.set({
					outcome: input.outcome,
					feedbackNote: input.feedbackNote ?? null,
					actorUserId: ctx.session.user.id,
				})
				.where(
					and(
						eq(factoryRuns.id, input.runId),
						eq(factoryRuns.organizationId, organizationId),
					),
				)
				.returning({ id: factoryRuns.id });
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
			}
			return updated;
		}),

	/** Active prompt per stage (custom version or code default). */
	listPrompts: protectedProcedure
		.input(z.object({ factoryId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getFactoryForOrg(organizationId, input.factoryId);
			const versions = await db
				.select()
				.from(factoryStagePrompts)
				.where(eq(factoryStagePrompts.factoryId, input.factoryId))
				.orderBy(desc(factoryStagePrompts.createdAt));
			return { versions, defaults: DEFAULT_STAGE_PROMPTS };
		}),

	/** Visibility header: throughput, backlog health, 7d outcome mix. */
	stats: protectedProcedure
		.input(z.object({ factoryId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getFactoryForOrg(organizationId, input.factoryId);

			const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
			const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

			const countItems = async (where: SQL | undefined) => {
				const [row] = await db
					.select({ n: count() })
					.from(factoryItems)
					.where(and(eq(factoryItems.factoryId, input.factoryId), where));
				return row?.n ?? 0;
			};

			const [active, blocked, done7d, done30d, outcomeRows] = await Promise.all(
				[
					countItems(
						and(
							isNull(factoryItems.archivedAt),
							notInArray(factoryItems.stage, ["done", "rejected"]),
						),
					),
					countItems(
						and(
							isNull(factoryItems.archivedAt),
							isNotNull(factoryItems.blockedReason),
						),
					),
					countItems(
						and(
							eq(factoryItems.stage, "done"),
							gte(factoryItems.stageEnteredAt, since7d),
						),
					),
					countItems(
						and(
							eq(factoryItems.stage, "done"),
							gte(factoryItems.stageEnteredAt, since30d),
						),
					),
					db
						.select({ outcome: factoryRuns.outcome, n: count() })
						.from(factoryRuns)
						.where(
							and(
								eq(factoryRuns.factoryId, input.factoryId),
								eq(factoryRuns.status, "reported"),
								gte(factoryRuns.reportedAt, since7d),
							),
						)
						.groupBy(factoryRuns.outcome),
				],
			);

			const outcomes7d: Record<string, number> = {};
			for (const row of outcomeRows) {
				if (row.outcome) outcomes7d[row.outcome] = row.n;
			}
			return { active, blocked, done7d, done30d, outcomes7d };
		}),

	/**
	 * Metrics sub-view (Mastra-style): 30d delivery flow, cycle time
	 * p50/p90, automation coverage per stage, intake mix. Queue health is
	 * computed client-side from listItems (live, not windowed).
	 */
	metrics: protectedProcedure
		.input(z.object({ factoryId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getFactoryForOrg(organizationId, input.factoryId);
			const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

			const doneItems = await db
				.select({
					createdAt: factoryItems.createdAt,
					doneAt: factoryItems.stageEnteredAt,
					source: factoryItems.source,
				})
				.from(factoryItems)
				.where(
					and(
						eq(factoryItems.factoryId, input.factoryId),
						eq(factoryItems.stage, "done"),
						gte(factoryItems.stageEnteredAt, since),
					),
				);

			const dailyDone = new Map<string, number>();
			const cycleHours: number[] = [];
			for (const item of doneItems) {
				const day = item.doneAt.toISOString().slice(0, 10);
				dailyDone.set(day, (dailyDone.get(day) ?? 0) + 1);
				cycleHours.push(
					(item.doneAt.getTime() - item.createdAt.getTime()) / 3_600_000,
				);
			}
			cycleHours.sort((a, b) => a - b);
			const quantile = (q: number) =>
				cycleHours.length === 0
					? null
					: cycleHours[
							Math.min(cycleHours.length - 1, Math.floor(q * cycleHours.length))
						];

			const runs = await db
				.select({
					stage: factoryRuns.stage,
					outcome: factoryRuns.outcome,
				})
				.from(factoryRuns)
				.where(
					and(
						eq(factoryRuns.factoryId, input.factoryId),
						eq(factoryRuns.status, "reported"),
						gte(factoryRuns.reportedAt, since),
					),
				);
			const coverage: Record<
				string,
				{
					agent: number;
					manual: number;
					success: number;
					flawed: number;
					blocked: number;
				}
			> = {};
			for (const run of runs) {
				let entry = coverage[run.stage];
				if (!entry) {
					entry = { agent: 0, manual: 0, success: 0, flawed: 0, blocked: 0 };
					coverage[run.stage] = entry;
				}
				if (run.outcome === "manual") entry.manual += 1;
				else {
					entry.agent += 1;
					if (run.outcome === "success") entry.success += 1;
					if (run.outcome === "flawed") entry.flawed += 1;
					if (run.outcome === "blocked") entry.blocked += 1;
				}
			}

			const intakeRows = await db
				.select({ source: factoryItems.source, n: count() })
				.from(factoryItems)
				.where(
					and(
						eq(factoryItems.factoryId, input.factoryId),
						gte(factoryItems.createdAt, since),
					),
				)
				.groupBy(factoryItems.source);
			const intakeMix: Record<string, number> = {};
			for (const row of intakeRows) intakeMix[row.source] = row.n;

			return {
				dailyDone: Object.fromEntries(dailyDone),
				cycle: {
					p50Hours: quantile(0.5),
					p90Hours: quantile(0.9),
					samples: cycleHours.length,
				},
				coverage,
				intakeMix,
			};
		}),

	/** Per-stage learning signal + recent improve runs, for the settings UI. */
	improveStatus: protectedProcedure
		.input(z.object({ factoryId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getFactoryForOrg(organizationId, input.factoryId);

			const signalCounts: Record<string, number> = {};
			for (const stage of AGENT_STAGES) {
				const runs = await gatherFlawedRuns(input.factoryId, stage);
				signalCounts[stage] = runs.length;
			}
			const improveRuns = await db
				.select()
				.from(factoryImproveRuns)
				.where(eq(factoryImproveRuns.factoryId, input.factoryId))
				.orderBy(desc(factoryImproveRuns.createdAt))
				.limit(20);
			return { signalCounts, improveRuns };
		}),

	/** Dispatch the improve meta-agent for a stage (the self-learning loop). */
	runImprove: protectedProcedure
		.input(
			z.object({ factoryId: z.string().uuid(), stage: z.enum(AGENT_STAGES) }),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const factory = await getFactoryForOrg(organizationId, input.factoryId);
			const outcome = await dispatchImproveRun({
				factory,
				stage: input.stage,
				relayUrl: await resolveUserRelayUrl(factory.ownerUserId),
			});
			if (outcome.status === "dispatch_failed") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: outcome.error,
				});
			}
			if (outcome.status === "skipped_offline") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: outcome.error,
				});
			}
			return { improveRunId: outcome.improveRunId };
		}),

	/** Called by the factory_propose_prompt MCP tool (meta-agent). */
	proposePrompt: protectedProcedure
		.input(
			z.object({
				improveRunId: z.string().uuid(),
				content: z.string().min(1).max(20_000),
				rationale: z.string().min(1).max(4000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return proposePromptForImproveRun({ organizationId, ...input });
		}),

	/** Human approval: draft → active (archives the previous active). */
	activatePrompt: protectedProcedure
		.input(z.object({ promptId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [draft] = await db
				.select()
				.from(factoryStagePrompts)
				.where(eq(factoryStagePrompts.id, input.promptId))
				.limit(1);
			if (!draft) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });
			}
			await getFactoryForOrg(organizationId, draft.factoryId);
			if (draft.status !== "draft") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only drafts can be activated",
				});
			}
			return dbWs.transaction(async (tx) => {
				await tx
					.update(factoryStagePrompts)
					.set({ status: "archived" })
					.where(
						and(
							eq(factoryStagePrompts.factoryId, draft.factoryId),
							eq(factoryStagePrompts.stage, draft.stage),
							eq(factoryStagePrompts.status, "active"),
						),
					);
				const [activated] = await tx
					.update(factoryStagePrompts)
					.set({ status: "active" })
					.where(eq(factoryStagePrompts.id, draft.id))
					.returning();
				return activated;
			});
		}),

	discardPrompt: protectedProcedure
		.input(z.object({ promptId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [draft] = await db
				.select()
				.from(factoryStagePrompts)
				.where(eq(factoryStagePrompts.id, input.promptId))
				.limit(1);
			if (!draft) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });
			}
			await getFactoryForOrg(organizationId, draft.factoryId);
			if (draft.status !== "draft") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only drafts can be discarded",
				});
			}
			const [updated] = await dbWs
				.update(factoryStagePrompts)
				.set({ status: "archived" })
				.where(eq(factoryStagePrompts.id, draft.id))
				.returning();
			return updated;
		}),

	setStagePrompt: protectedProcedure
		.input(setStagePromptSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getFactoryForOrg(organizationId, input.factoryId);

			return dbWs.transaction(async (tx) => {
				await tx
					.update(factoryStagePrompts)
					.set({ status: "archived" })
					.where(
						and(
							eq(factoryStagePrompts.factoryId, input.factoryId),
							eq(factoryStagePrompts.stage, input.stage),
							eq(factoryStagePrompts.status, "active"),
						),
					);
				const [latest] = await tx
					.select({ version: max(factoryStagePrompts.version) })
					.from(factoryStagePrompts)
					.where(
						and(
							eq(factoryStagePrompts.factoryId, input.factoryId),
							eq(factoryStagePrompts.stage, input.stage),
						),
					);
				const [created] = await tx
					.insert(factoryStagePrompts)
					.values({
						factoryId: input.factoryId,
						stage: input.stage,
						version: (latest?.version ?? 0) + 1,
						content: input.content,
						status: "active",
						authoredBy: "human",
						authorUserId: ctx.session.user.id,
					})
					.returning();
				return created;
			});
		}),
} satisfies TRPCRouterRecord;
