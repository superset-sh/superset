import { db, dbWs } from "@superset/db/client";
import {
	automationEvents,
	automationRuns,
	automations,
	automationTriggers,
	cloudWorkspaces,
	v2Hosts,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { escapeLikePattern } from "@superset/db/utils";
import type { DraftTrigger } from "@superset/shared/automation-triggers";
import {
	AUTOMATIONS_REQUIRED_PLAN,
	planAllowsAutomations,
	planTierFromSubscription,
} from "@superset/shared/billing";
import {
	CLOUD_AGENT_PROMPT_MAX_LENGTH,
	isCloudAgentId,
} from "@superset/shared/cloud-agent-launch";
import {
	FAILED_RUN_STATUSES,
	MISSED_RUN_STATUSES,
	UNSUCCESSFUL_RUN_STATUSES,
} from "@superset/shared/constants";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import {
	describeSchedule,
	nextOccurrenceAfter,
	nextOccurrences,
	parseRrule,
} from "@superset/shared/rrule";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	notInArray,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { assertCloudAccess } from "../../lib/cloud-guards";
import { nudge } from "../../lib/realtime";
import { planRequiredError, protectedProcedure, userError } from "../../trpc";
import { loadUsableEnvironment } from "../cloud-workspace/start";
import { joinSlackTriggerChannels } from "../integration/slack/joinChannels";
import {
	requireActiveOrgMembership,
	requireActiveOrgMembershipWithSubscription,
} from "../utils/active-org";
import { dispatchAutomation } from "./dispatch";
import {
	automationBaseColumns,
	automationNotFound,
	getAutomationForUser,
	NO_SCHEDULE,
	promptSourceFromSession,
	recordPromptVersion,
	refreshScheduleNextRuns,
	requireAutomationDeleteAccess,
	scheduleSummariesFor,
	summarizeSchedules,
	syncScheduleTrigger,
} from "./helpers";
import {
	createAutomationSchema,
	listOrgRunsSchema,
	listRunsSchema,
	parseRruleSchema,
	runPayloadSchema,
	setAutomationPromptSchema,
	updateAutomationSchema,
} from "./schema";
import {
	type AutomationTarget,
	NO_TARGET,
	needsLegacyWorkspace,
	newCloudPin,
	planTarget,
	type TargetInput,
	type TargetLookups,
} from "./targetPlan";
import { saveTriggerSet } from "./triggerSet";
import { automationVersionsRouter } from "./versions";
import { generateWebhookToken, hashWebhookToken } from "./webhookSecret";

/**
 * Membership plus the Pro gate. Automations are a Pro feature: creating,
 * running, and resuming one needs a paying org. Reading, editing, pausing,
 * and deleting stay open so a downgraded org keeps control of what it has —
 * those rows simply stop firing (the dispatchers apply the same tier map).
 */
async function requireAutomationsPlan(
	ctx: Parameters<typeof requireActiveOrgMembershipWithSubscription>[0],
): Promise<string> {
	const { organizationId, subscription } =
		await requireActiveOrgMembershipWithSubscription(ctx);
	if (!planAllowsAutomations(planTierFromSubscription(subscription))) {
		throw planRequiredError({
			message: "Automations require the Pro plan.",
			i18nKey: "serverError.automation.automationsRequireThePro",
			requiredPlan: AUTOMATIONS_REQUIRED_PLAN,
		});
	}
	return organizationId;
}

async function verifyHostAccess(
	userId: string,
	organizationId: string,
	hostId: string,
): Promise<void> {
	const [host] = await db
		.select({ machineId: v2Hosts.machineId })
		.from(v2Hosts)
		.where(
			and(
				eq(v2Hosts.organizationId, organizationId),
				eq(v2Hosts.machineId, hostId),
			),
		)
		.limit(1);

	if (!host) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Host ${hostId} is not registered in this organization`,
		});
	}

	const [membership] = await db
		.select({ hostId: v2UsersHosts.hostId })
		.from(v2UsersHosts)
		.where(
			and(
				eq(v2UsersHosts.userId, userId),
				eq(v2UsersHosts.organizationId, organizationId),
				eq(v2UsersHosts.hostId, hostId),
			),
		)
		.limit(1);

	if (!membership) {
		throw userError({
			code: "FORBIDDEN",
			message: "You don't have access to this host",
			i18nKey: "serverError.automation.youDonTHaveAccess",
		});
	}
}

/**
 * The one run query. Both run lists read through this: All runs org-wide, and
 * an automation's own history as the same list filtered to it. Two queries
 * drifted apart once already, rendering the same run differently per screen.
 */
function selectRuns(args: {
	organizationId: string;
	userId: string;
	automationId?: string;
	status?: "all" | "failed" | "missed";
	scope?: "all" | "mine";
	cursor?: { createdAt: string; id: string };
	limit: number;
}) {
	return db
		.select({
			id: automationRuns.id,
			automationId: automationRuns.automationId,
			automationName: automations.name,
			ownerUserId: automations.ownerUserId,
			title: automationRuns.title,
			status: automationRuns.status,
			error: automationRuns.error,
			errorCode: automationRuns.errorCode,
			createdAt: automationRuns.createdAt,
			cursorAt: sql<string>`${automationRuns.createdAt}::text`,
			scheduledFor: automationRuns.scheduledFor,
			dispatchedAt: automationRuns.dispatchedAt,
			hostId: automationRuns.hostId,
			triggerKind: automationTriggers.kind,
			v2WorkspaceId: automationRuns.v2WorkspaceId,
			cloudWorkspaceId: automationRuns.cloudWorkspaceId,
			chatSessionId: automationRuns.chatSessionId,
			terminalSessionId: automationRuns.terminalSessionId,
			eventId: automationRuns.eventId,
		})
		.from(automationRuns)
		.innerJoin(automations, eq(automations.id, automationRuns.automationId))
		.leftJoin(
			automationTriggers,
			eq(automationTriggers.id, automationRuns.triggerId),
		)
		.where(
			and(
				eq(automationRuns.organizationId, args.organizationId),
				args.automationId
					? eq(automationRuns.automationId, args.automationId)
					: undefined,
				args.status === "failed"
					? inArray(automationRuns.status, [...FAILED_RUN_STATUSES])
					: args.status === "missed"
						? inArray(automationRuns.status, [...MISSED_RUN_STATUSES])
						: undefined,
				args.scope === "mine"
					? eq(automations.ownerUserId, args.userId)
					: undefined,
				args.cursor
					? sql`(${automationRuns.createdAt}, ${automationRuns.id}) < (${args.cursor.createdAt}::timestamptz, ${args.cursor.id}::uuid)`
					: undefined,
			),
		)
		.orderBy(desc(automationRuns.createdAt), desc(automationRuns.id))
		.limit(args.limit);
}

/**
 * A trigger set replaces the whole set, so a top-level `rrule` passed beside
 * one is dropped and its schedule never fires. Refusing beats accepting a
 * write we only half-apply — the caller asked for a schedule.
 */
function assertScheduleNotShadowed(
	rrule: string | null | undefined,
	triggers: DraftTrigger[] | null | undefined,
): void {
	if (!rrule || !triggers) return;
	throw userError({
		code: "BAD_REQUEST",
		message:
			"Pass the schedule inside triggers as a schedule trigger, not as rrule beside them",
		i18nKey: "serverError.automation.rruleBesideTriggers",
	});
}

/** Room for the trigger block the dispatcher puts ahead of the instructions. */
const CLOUD_PROMPT_MAX_LENGTH = CLOUD_AGENT_PROMPT_MAX_LENGTH - 2_000;

function assertPromptFitsTarget(targetHostId: string | null, prompt: string) {
	if (
		targetHostId === CLOUD_HOST_ID &&
		prompt.length > CLOUD_PROMPT_MAX_LENGTH
	) {
		throw userError({
			code: "BAD_REQUEST",
			message: `A cloud automation's instructions can be at most ${CLOUD_PROMPT_MAX_LENGTH} characters`,
			i18nKey: "serverError.automation.cloudPromptTooLong",
			params: { max: CLOUD_PROMPT_MAX_LENGTH },
		});
	}
}

/** Looks up what the input names, plans the target, then runs the checks the plan asks for. */
async function resolveTarget(
	ctx: { session: { user: { id: string; email: string } } },
	organizationId: string,
	existing: AutomationTarget,
	input: TargetInput,
	agent: string,
): Promise<AutomationTarget> {
	const userId = ctx.session.user.id;
	const lookups: TargetLookups = {};
	if (needsLegacyWorkspace(input) && input.v2WorkspaceId) {
		lookups.legacyWorkspace = await verifyWorkspaceInOrg(
			organizationId,
			input.v2WorkspaceId,
		);
	}
	const pin = newCloudPin(existing, input);
	if (pin) {
		lookups.pinEnvironmentId = await ownCloudWorkspaceEnvironment(
			userId,
			organizationId,
			pin,
		);
	}

	const plan = planTarget(existing, input, lookups);
	for (const hostId of plan.hostsToVerify) {
		await verifyHostAccess(userId, organizationId, hostId);
	}
	if (plan.cloud) {
		await assertCloudAccess({ userId, session: ctx.session });
		if (!isCloudAgentId(agent)) {
			throw userError({
				code: "BAD_REQUEST",
				message: "This agent can't run in a cloud workspace",
				i18nKey: "serverError.automation.cloudAgentUnsupported",
			});
		}
		if (plan.cloud.environmentToVerify) {
			await loadUsableEnvironment({
				organizationId,
				userId,
				environmentId: plan.cloud.environmentToVerify,
			});
		}
	}
	return plan.target;
}

/** The pinned cloud workspace's environment, refused unless the caller created it. */
async function ownCloudWorkspaceEnvironment(
	userId: string,
	organizationId: string,
	cloudWorkspaceId: string,
): Promise<string | null> {
	const workspace = await db.query.cloudWorkspaces.findFirst({
		where: and(
			eq(cloudWorkspaces.id, cloudWorkspaceId),
			eq(cloudWorkspaces.organizationId, organizationId),
			notInArray(cloudWorkspaces.status, ["archived", "failed"]),
		),
		columns: { environmentId: true, createdByUserId: true },
	});
	if (!workspace) {
		throw userError({
			code: "NOT_FOUND",
			message: "Not found",
			i18nKey: "serverError.cloudWorkspace.notFound",
		});
	}
	// Waking a box hands it its creator's agent and GitHub credentials.
	if (workspace.createdByUserId !== userId) {
		throw userError({
			code: "FORBIDDEN",
			message: "An automation can only use a cloud workspace you created",
			i18nKey: "serverError.automation.cloudWorkspaceNotYours",
		});
	}
	return workspace.environmentId;
}

async function verifyWorkspaceInOrg(
	organizationId: string,
	workspaceId: string,
): Promise<{ id: string; projectId: string; hostId: string }> {
	const [workspace] = await db
		.select({
			id: v2Workspaces.id,
			organizationId: v2Workspaces.organizationId,
			projectId: v2Workspaces.projectId,
			hostId: v2Workspaces.hostId,
		})
		.from(v2Workspaces)
		.where(eq(v2Workspaces.id, workspaceId))
		.limit(1);

	if (!workspace || workspace.organizationId !== organizationId) {
		throw userError({
			code: "NOT_FOUND",
			message: "Workspace not found",
			i18nKey: "serverError.automation.workspaceNotFound",
		});
	}
	return {
		id: workspace.id,
		projectId: workspace.projectId,
		hostId: workspace.hostId,
	};
}

/**
 * Builds the schedule half of a mutation response from what was actually saved.
 *
 * An automation may now have no schedule at all — an event-only trigger set is
 * the normal case for a GitHub or Slack automation — so every schedule field is
 * nullable here, and reporting the input back would describe a schedule that was
 * never written.
 */
function withSchedule<T>(
	row: T,
	triggers: DraftTrigger[] | null,
	legacy: {
		rrule: string;
		dtstart: Date;
		timezone: string | null;
		nextRunAt: Date;
	} | null,
) {
	const scheduled = triggers?.find((t) => t.config.kind === "schedule");
	if (scheduled && scheduled.config.kind === "schedule") {
		const { rrule, dtstart, timezone } = scheduled.config;
		return {
			...row,
			rrule,
			dtstart: new Date(dtstart),
			timezone,
			nextRunAt: nextOccurrenceAfter({
				rrule,
				dtstart: new Date(dtstart),
				timezone,
				after: new Date(),
			}),
			scheduleText: safeDescribeRrule({ rrule }),
		};
	}
	if (triggers) {
		// Event-only: no schedule to report.
		return {
			...row,
			rrule: null,
			dtstart: null,
			timezone: null,
			nextRunAt: null,
			scheduleText: null,
		};
	}
	return {
		...row,
		rrule: legacy?.rrule ?? null,
		dtstart: legacy?.dtstart ?? null,
		timezone: legacy?.timezone ?? null,
		nextRunAt: legacy?.nextRunAt ?? null,
		scheduleText: legacy ? safeDescribeRrule({ rrule: legacy.rrule }) : null,
	};
}

export const automationRouter = {
	versions: automationVersionsRouter,

	/**
	 * List automations scoped to the caller's active organization. The
	 * `prompt` body is omitted — call `getPrompt` to fetch it for one row.
	 */
	list: protectedProcedure
		.input(
			z
				.object({
					name: z
						.string()
						.trim()
						.min(1)
						.optional()
						.describe("Case-insensitive substring match on automation name."),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const rows = await db
				.select(automationBaseColumns)
				.from(automations)
				.where(
					and(
						eq(automations.organizationId, organizationId),
						input?.name
							? ilike(automations.name, `%${escapeLikePattern(input.name)}%`)
							: undefined,
					),
				)
				.orderBy(desc(automations.createdAt));

			// Fetched separately rather than joined: an automation can hold more
			// than one schedule, and a join would list it once per schedule.
			const summaries = await scheduleSummariesFor(rows.map((row) => row.id));

			return rows.map((row) => {
				const schedule = summaries.get(row.id) ?? {
					...NO_SCHEDULE,
					triggerCount: 0,
				};
				return {
					...row,
					...schedule,
					scheduleText: safeDescribeRrule(schedule),
				};
			});
		}),

	/**
	 * Get one automation's metadata. The `prompt` body is omitted (it can be
	 * large markdown) — call `getPrompt` to fetch it. Use `listRuns` for
	 * run history.
	 */
	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [row] = await db
				.select(automationBaseColumns)
				.from(automations)
				.where(
					and(
						eq(automations.id, input.id),
						eq(automations.organizationId, organizationId),
					),
				)
				.limit(1);

			// Reads are org-scoped (Team tab links to any member's automation);
			// mutations stay owner-scoped via getAutomationForUser.
			if (!row) {
				throw await automationNotFound(input.id, ctx.session.user.id);
			}

			// The whole set, since the editor saves it as one and needs the ids to
			// update rows in place rather than replacing them.
			const triggers = await db
				.select({
					id: automationTriggers.id,
					kind: automationTriggers.kind,
					config: automationTriggers.config,
					connectionId: automationTriggers.connectionId,
					nextRunAt: automationTriggers.nextRunAt,
					secretPrefix: automationTriggers.secretPrefix,
					secretRotatedAt: automationTriggers.secretRotatedAt,
				})
				.from(automationTriggers)
				.where(eq(automationTriggers.automationId, input.id))
				.orderBy(asc(automationTriggers.createdAt));

			// Derived from the set just fetched rather than a second query.
			const schedule = summarizeSchedules(triggers);
			return {
				...row,
				...schedule,
				triggers,
				scheduleText: safeDescribeRrule(schedule),
			};
		}),

	create: protectedProcedure
		.input(createAutomationSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAutomationsPlan(ctx);

			const target = await resolveTarget(
				ctx,
				organizationId,
				NO_TARGET,
				{
					targetHostId: input.targetHostId,
					// A null project is the default here, never a conflicting one.
					v2ProjectId: input.v2ProjectId ?? undefined,
					v2WorkspaceId: input.v2WorkspaceId,
					cloudWorkspaceId: input.cloudWorkspaceId,
					environmentId: input.environmentId,
					continueAgentSession: input.continueAgentSession,
				},
				input.agent,
			);
			assertPromptFitsTarget(target.targetHostId, input.prompt);

			assertScheduleNotShadowed(input.rrule, input.triggers);

			// Only the legacy shape carries a top-level schedule; a trigger set
			// describes its own, or has none at all.
			const legacySchedule = input.rrule
				? (() => {
						const dtstart = input.dtstart ?? new Date();
						return {
							rrule: input.rrule,
							dtstart,
							timezone: input.timezone ?? "UTC",
							nextRunAt: parseRrule({
								rrule: input.rrule,
								dtstart,
								timezone: input.timezone ?? "UTC",
							}).nextRunAt,
						};
					})()
				: null;

			const created = await dbWs.transaction(async (tx) => {
				const inserted = await tx
					.insert(automations)
					.values({
						organizationId,
						ownerUserId: ctx.session.user.id,
						name: input.name,
						prompt: input.prompt,
						agent: input.agent,
						...target,
						// Every automation groups its runs out of the box; explicit
						// tags (including []) override the default.
						tags: input.tags ?? ["automation"],
					})
					.returning();

				const row = inserted[0];
				if (!row) {
					throw userError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create automation",
						i18nKey: "serverError.automation.failedToCreateAutomation",
					});
				}

				if (input.triggers) {
					await saveTriggerSet(tx, {
						automationId: row.id,
						organizationId,
						triggers: input.triggers,
					});
				} else if (legacySchedule) {
					// Legacy shape: a top-level rrule becomes the schedule trigger.
					await syncScheduleTrigger(tx, {
						automationId: row.id,
						organizationId,
						...legacySchedule,
					});
				}

				// An untitled automation starts with no instructions; recording that
				// as v1 would put an empty entry in every version history. Trimmed,
				// to match what runNow and the dispatcher call instruction-less.
				if (input.prompt.trim().length > 0) {
					await recordPromptVersion(tx, {
						automationId: row.id,
						authorUserId: ctx.session.user.id,
						content: input.prompt,
						source: promptSourceFromSession(ctx.session),
					});
				}

				return row;
			});

			// Reported from what was actually written, not from the input: a
			// trigger set may describe a different schedule, or none at all.
			// After the commit: joining can only make a saved trigger start working.
			if (input.triggers) {
				await joinSlackTriggerChannels(
					organizationId,
					ctx.session.user.id,
					input.triggers,
				);
			}

			return withSchedule(created, input.triggers ?? null, legacySchedule);
		}),

	update: protectedProcedure
		.input(updateAutomationSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			const target = await resolveTarget(
				ctx,
				organizationId,
				existing,
				{
					targetHostId: input.targetHostId,
					v2ProjectId: input.v2ProjectId,
					v2WorkspaceId: input.v2WorkspaceId,
					cloudWorkspaceId: input.cloudWorkspaceId,
					environmentId: input.environmentId,
					continueAgentSession: input.continueAgentSession,
				},
				input.agent ?? existing.agent,
			);
			assertPromptFitsTarget(
				target.targetHostId,
				input.prompt ?? existing.prompt,
			);

			assertScheduleNotShadowed(input.rrule, input.triggers);

			const nextRrule = input.rrule ?? existing.rrule;
			const nextDtstart = input.dtstart ?? existing.dtstart;
			const nextTimezone = input.timezone ?? existing.timezone;
			const recurrenceChanged =
				input.rrule !== undefined ||
				input.dtstart !== undefined ||
				input.timezone !== undefined;

			const recomputedNextRunAt =
				recurrenceChanged && nextRrule && nextDtstart && nextTimezone
					? parseRrule({
							rrule: nextRrule,
							dtstart: nextDtstart,
							timezone: nextTimezone,
						}).nextRunAt
					: existing.nextRunAt;

			const updated = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(automations)
					.set({
						name: input.name ?? existing.name,
						agent: input.agent ?? existing.agent,
						...target,
						tags: input.tags ?? existing.tags,
						prompt: input.prompt ?? existing.prompt,
					})
					.where(eq(automations.id, input.id))
					.returning();

				if (!row) {
					throw userError({
						code: "NOT_FOUND",
						message: "Automation not found",
						i18nKey: "serverError.automation.automationNotFound",
					});
				}

				// Only on a real change, so saving a scope tweak doesn't mint a
				// version identical to the last one.
				if (input.prompt !== undefined && input.prompt !== existing.prompt) {
					await recordPromptVersion(tx, {
						automationId: row.id,
						authorUserId: ctx.session.user.id,
						content: input.prompt,
						source: promptSourceFromSession(ctx.session),
					});
				}
				if (input.triggers) {
					await saveTriggerSet(tx, {
						automationId: row.id,
						organizationId,
						triggers: input.triggers,
					});
				} else if (nextRrule && nextDtstart && nextTimezone) {
					await syncScheduleTrigger(tx, {
						automationId: row.id,
						organizationId,
						rrule: nextRrule,
						dtstart: nextDtstart,
						timezone: nextTimezone,
						nextRunAt: recomputedNextRunAt,
					});
				}

				return row;
			});

			if (input.triggers) {
				await joinSlackTriggerChannels(
					organizationId,
					ctx.session.user.id,
					input.triggers,
				);
			}

			// Same as create: a trigger set may have replaced or removed the
			// schedule, so the response reflects what was saved.
			return withSchedule(
				updated,
				input.triggers ?? null,
				nextRrule && nextDtstart && recomputedNextRunAt
					? {
							rrule: nextRrule,
							dtstart: nextDtstart,
							timezone: nextTimezone,
							nextRunAt: recomputedNextRunAt,
						}
					: null,
			);
		}),

	getPrompt: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [existing] = await db
				.select({ id: automations.id, prompt: automations.prompt })
				.from(automations)
				.where(
					and(
						eq(automations.id, input.id),
						eq(automations.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!existing) {
				throw await automationNotFound(input.id, ctx.session.user.id);
			}
			return existing;
		}),

	setPrompt: protectedProcedure
		.input(setAutomationPromptSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			if (existing.prompt === input.prompt) {
				return { ...existing, scheduleText: safeDescribeRrule(existing) };
			}
			assertPromptFitsTarget(existing.targetHostId, input.prompt);

			const updated = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(automations)
					.set({ prompt: input.prompt })
					.where(eq(automations.id, input.id))
					.returning();

				if (!row) {
					throw userError({
						code: "NOT_FOUND",
						message: "Automation not found",
						i18nKey: "serverError.automation.automationNotFound",
					});
				}

				await recordPromptVersion(tx, {
					automationId: input.id,
					authorUserId: ctx.session.user.id,
					content: input.prompt,
					source: promptSourceFromSession(ctx.session),
				});

				return row;
			});

			// `updated` is the automations row; the schedule comes from the trigger.
			return {
				...updated,
				rrule: existing.rrule,
				dtstart: existing.dtstart,
				timezone: existing.timezone,
				nextRunAt: existing.nextRunAt,
				scheduleText: safeDescribeRrule(existing),
			};
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await requireAutomationDeleteAccess(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			await db.delete(automations).where(eq(automations.id, input.id));
			nudge(organizationId, "automation_runs");

			return { ok: true };
		}),

	setEnabled: protectedProcedure
		.input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			// Pausing is always allowed; resuming is what needs the plan.
			const organizationId = input.enabled
				? await requireAutomationsPlan(ctx)
				: await requireActiveOrgMembership(ctx);
			const existing = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			const resuming = input.enabled && !existing.enabled;

			const updated = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(automations)
					.set({ enabled: input.enabled })
					.where(eq(automations.id, input.id))
					.returning();

				if (!row) {
					throw userError({
						code: "NOT_FOUND",
						message: "Automation not found",
						i18nKey: "serverError.automation.automationNotFound",
					});
				}

				// Every schedule, not the soonest one: rewriting through the
				// single-schedule shape would collapse the rest into it.
				if (resuming) await refreshScheduleNextRuns(tx, row.id);

				return row;
			});

			// Re-read rather than echo the input: the resume just recomputed every
			// schedule's next run, and the soonest of them is what changed.
			const schedule = (await scheduleSummariesFor([updated.id])).get(
				updated.id,
			) ?? { ...NO_SCHEDULE, triggerCount: 0 };
			return {
				...updated,
				...schedule,
				scheduleText: safeDescribeRrule(schedule),
			};
		}),

	runNow: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAutomationsPlan(ctx);
			const automation = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			// The dispatcher refuses this too, but through runNow it would surface
			// as a 500 — an expected user state, not a server fault.
			if (automation.prompt.trim().length === 0) {
				throw userError({
					code: "PRECONDITION_FAILED",
					message: "Automation has no instructions",
					i18nKey: "serverError.automation.automationHasNoInstructions",
				});
			}

			const outcome = await dispatchAutomation({
				automation,
				scheduledFor: new Date(),
				relayUrl: env.RELAY_URL,
			});

			if (outcome.status === "conflict") {
				throw userError({
					code: "CONFLICT",
					message: "A run for this automation is already in progress.",
					i18nKey: "serverError.automation.aRunForThisAutomation",
				});
			}
			// The message is the host's own wording, so there is nothing to
			// translate — but the code travels with it so the client picks its
			// guidance without reading the prose.
			if (outcome.status === "dispatch_failed") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: outcome.error,
					cause: { automationErrorCode: outcome.errorCode },
				});
			}
			if (outcome.status === "skipped_offline") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: outcome.error,
					cause: { automationErrorCode: outcome.errorCode },
				});
			}
			return { automationId: automation.id, runId: outcome.runId };
		}),

	/**
	 * Issues a new bearer token for a webhook trigger, replacing any previous
	 * one. The token is returned once; only its hash is stored.
	 */
	rotateWebhookSecret: protectedProcedure
		.input(z.object({ triggerId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [trigger] = await db
				.select({
					id: automationTriggers.id,
					kind: automationTriggers.kind,
					automationId: automationTriggers.automationId,
				})
				.from(automationTriggers)
				.where(
					and(
						eq(automationTriggers.id, input.triggerId),
						eq(automationTriggers.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!trigger || trigger.kind !== "webhook") {
				throw userError({
					code: "NOT_FOUND",
					message: "Webhook trigger not found",
					i18nKey: "serverError.automation.webhookTriggerNotFound",
				});
			}
			await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				trigger.automationId,
			);

			const { token, prefix } = generateWebhookToken();
			const rotatedAt = new Date();
			await db
				.update(automationTriggers)
				.set({
					secretHash: hashWebhookToken(token),
					secretPrefix: prefix,
					secretRotatedAt: rotatedAt,
				})
				.where(eq(automationTriggers.id, trigger.id));

			return { triggerId: trigger.id, token, prefix, rotatedAt };
		}),

	/**
	 * Stores a provider-issued signing secret on a trigger, verbatim — an HMAC
	 * verifier needs the raw key. Bearer-token kinds use `rotateWebhookSecret`.
	 */
	setTriggerSecret: protectedProcedure
		.input(
			z.object({
				triggerId: z.string().uuid(),
				secret: z.string().min(1).max(500),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [trigger] = await db
				.select({
					id: automationTriggers.id,
					kind: automationTriggers.kind,
					automationId: automationTriggers.automationId,
				})
				.from(automationTriggers)
				.where(
					and(
						eq(automationTriggers.id, input.triggerId),
						eq(automationTriggers.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!trigger || trigger.kind === "webhook") {
				throw userError({
					code: "NOT_FOUND",
					message: "Trigger not found",
					i18nKey: "serverError.automation.triggerNotFound",
				});
			}
			await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				trigger.automationId,
			);

			const prefix = input.secret.slice(0, 12);
			const rotatedAt = new Date();
			await db
				.update(automationTriggers)
				.set({
					secretHash: input.secret,
					secretPrefix: prefix,
					secretRotatedAt: rotatedAt,
				})
				.where(eq(automationTriggers.id, trigger.id));

			return { triggerId: trigger.id, prefix, rotatedAt };
		}),

	/** Run history for a given automation (paginated). */
	listRuns: protectedProcedure
		.input(listRunsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.automationId,
			);

			// Reads through selectRuns so the CLI and MCP see the same rows the
			// screens do. The shape stays as shipped: no cursor field, and the
			// run columns `automations logs` prints.
			const rows = await selectRuns({
				organizationId,
				userId: ctx.session.user.id,
				automationId: input.automationId,
				limit: input.limit,
			});
			return rows.map(({ cursorAt: _cursorAt, ...run }) => run);
		}),

	listOrgRuns: protectedProcedure
		.input(listOrgRunsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const rows = await selectRuns({
				organizationId,
				userId,
				automationId: input.automationId,
				status: input.status,
				scope: input.scope,
				cursor: input.cursor,
				limit: input.limit + 1,
			});

			const hasMore = rows.length > input.limit;
			const page = hasMore ? rows.slice(0, input.limit) : rows;
			const last = page.at(-1);

			return {
				runs: page.map(({ eventId, cursorAt: _cursorAt, ...run }) => ({
					...run,
					hasPayload: eventId !== null,
					// "Run again" dispatches a fresh schedule-caused run, so it
					// cannot carry an event run's message, PR or issue — retrying
					// one would start the agent with nothing. Until there is a
					// retryRun that re-dispatches a row with its own cause, only
					// failed schedule-caused runs can be retried.
					canRetry:
						run.ownerUserId === userId &&
						(UNSUCCESSFUL_RUN_STATUSES as readonly string[]).includes(
							run.status,
						) &&
						run.scheduledFor !== null,
				})),
				nextCursor:
					hasMore && last ? { createdAt: last.cursorAt, id: last.id } : null,
			};
		}),

	runPayload: protectedProcedure
		.input(runPayloadSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [row] = await db
				.select({
					payload: automationEvents.payload,
					provider: automationEvents.provider,
					receivedAt: automationEvents.receivedAt,
				})
				.from(automationRuns)
				.innerJoin(
					automationEvents,
					eq(automationEvents.id, automationRuns.eventId),
				)
				.where(
					and(
						eq(automationRuns.id, input.runId),
						eq(automationRuns.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!row) return { payload: null, provider: null, receivedAt: null };
			return row;
		}),

	/** Most recent run per automation across the caller's active organization. */
	latestRuns: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);

		return db
			.selectDistinctOn([automationRuns.automationId], {
				automationId: automationRuns.automationId,
				status: automationRuns.status,
				createdAt: automationRuns.createdAt,
				v2WorkspaceId: automationRuns.v2WorkspaceId,
				cloudWorkspaceId: automationRuns.cloudWorkspaceId,
				chatSessionId: automationRuns.chatSessionId,
				terminalSessionId: automationRuns.terminalSessionId,
				ownerUserId: automations.ownerUserId,
			})
			.from(automationRuns)
			.innerJoin(automations, eq(automations.id, automationRuns.automationId))
			.where(eq(automationRuns.organizationId, organizationId))
			.orderBy(automationRuns.automationId, desc(automationRuns.createdAt));
	}),

	/**
	 * Run volume for the org's last 7 days: success/failure totals for the
	 * stat cards and 6-hour activity buckets for the run-history sparkline.
	 * Aggregated in SQL — an org can have tens of thousands of runs a week.
	 */
	orgRunStats: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const bucketSeconds = 6 * 60 * 60;
		const bucketCount = 28;
		// The window ends on the interval in progress, so the newest bar is the
		// one drawing now. Anchoring it 28 intervals back instead would push
		// that interval to index 28 and drop it off the end.
		const baseBucket =
			Math.floor(Date.now() / 1000 / bucketSeconds) - (bucketCount - 1);
		const since = new Date(baseBucket * bucketSeconds * 1000);

		const rows = await db
			.select({
				bucket: sql<number>`floor(extract(epoch from ${automationRuns.createdAt}) / ${bucketSeconds})::int`,
				status: automationRuns.status,
				count: sql<number>`count(*)::int`,
			})
			.from(automationRuns)
			.where(
				and(
					eq(automationRuns.organizationId, organizationId),
					gte(automationRuns.createdAt, since),
				),
			)
			.groupBy(sql`1`, automationRuns.status);

		let succeeded = 0;
		let failed = 0;
		let missed = 0;
		const buckets: number[] = Array(bucketCount).fill(0);
		for (const row of rows) {
			if (row.status === "dispatched") succeeded += row.count;
			else if ((FAILED_RUN_STATUSES as readonly string[]).includes(row.status))
				failed += row.count;
			else if ((MISSED_RUN_STATUSES as readonly string[]).includes(row.status))
				missed += row.count;
			const index = row.bucket - baseBucket;
			if (index >= 0 && index < bucketCount)
				buckets[index] = (buckets[index] ?? 0) + row.count;
		}
		return { succeeded, failed, missed, buckets };
	}),

	/** Validate an RRule body + preview its next occurrences. */
	validateRrule: protectedProcedure
		.input(parseRruleSchema)
		.mutation(async ({ input }) => {
			const dtstart = input.dtstart ?? new Date();
			const { nextRunAt } = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			});
			return {
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
				scheduleText: describeSchedule(input.rrule),
				nextRunAt,
				nextRuns: nextOccurrences({
					rrule: input.rrule,
					dtstart,
					timezone: input.timezone,
					count: 5,
				}),
			};
		}),
} satisfies TRPCRouterRecord;

/**
 * Floors a Date down to the minute so two dispatches in the same minute bucket
 * collide on the unique index.
 */
function bucketToMinute(date: Date): Date {
	const copy = new Date(date.getTime());
	copy.setUTCSeconds(0, 0);
	return copy;
}

/** Empty when there is no schedule, which is normal for an event-only automation. */
function safeDescribeRrule(
	row: { rrule: string | null } | null | undefined,
): string {
	if (!row?.rrule) return "";
	try {
		return describeSchedule(row.rrule);
	} catch {
		return row.rrule;
	}
}

export { bucketToMinute };
