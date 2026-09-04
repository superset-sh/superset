import { db, dbWs } from "@superset/db/client";
import {
	automationRuns,
	automations,
	automationTriggers,
	v2Hosts,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import type { DraftTrigger } from "@superset/shared/automation-triggers";
import {
	describeSchedule,
	nextOccurrenceAfter,
	nextOccurrences,
	parseRrule,
} from "@superset/shared/rrule";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure, userError } from "../../trpc";
import { joinSlackTriggerChannels } from "../integration/slack/joinChannels";
import { requireActiveOrgMembership } from "../utils/active-org";
import { dispatchAutomation } from "./dispatch";
import {
	automationBaseColumns,
	getAutomationForUser,
	NO_SCHEDULE,
	promptSourceFromSession,
	recordPromptVersion,
	refreshScheduleNextRuns,
	scheduleSummariesFor,
	summarizeSchedules,
	syncScheduleTrigger,
} from "./helpers";
import {
	createAutomationSchema,
	listRunsSchema,
	parseRruleSchema,
	setAutomationPromptSchema,
	updateAutomationSchema,
} from "./schema";
import { saveTriggerSet } from "./triggerSet";
import { automationVersionsRouter } from "./versions";
import { generateWebhookToken, hashWebhookToken } from "./webhookSecret";

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
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
				throw userError({
					code: "NOT_FOUND",
					message: "Automation not found",
					i18nKey: "serverError.automation.automationNotFound",
				});
			}

			// The whole set, since the editor saves it as one and needs the ids to
			// update rows in place rather than replacing them.
			const triggers = await db
				.select({
					id: automationTriggers.id,
					kind: automationTriggers.kind,
					config: automationTriggers.config,
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
			const organizationId = await requireActiveOrgMembership(ctx);

			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}

			let targetHostId = input.targetHostId ?? null;
			let v2ProjectId = input.v2ProjectId ?? null;
			// Denormalized pin: a client that supplies hostId (and projectId, when
			// the workspace has one) alongside the workspace id needs no registry
			// lookup — hosts own workspace records. A null project means the pin
			// is a session workspace. Host access is still verified below; a
			// stale pin surfaces as a host-side error at run time, same as today.
			if (input.v2WorkspaceId && !targetHostId) {
				// Legacy clients (pre-denormalization) — resolve via the cloud
				// table while it still exists; this branch is deleted in R3.
				const workspace = await verifyWorkspaceInOrg(
					organizationId,
					input.v2WorkspaceId,
				);
				if (targetHostId && targetHostId !== workspace.hostId) {
					throw userError({
						code: "BAD_REQUEST",
						message: "targetHostId does not match the workspace's host",
						i18nKey:
							"serverError.automation.targethostidDoesNotMatchTheWorkspace",
					});
				}
				targetHostId = workspace.hostId;
				if (v2ProjectId && v2ProjectId !== workspace.projectId) {
					throw userError({
						code: "BAD_REQUEST",
						message: "v2ProjectId does not match the workspace's project",
						i18nKey:
							"serverError.automation.v2projectidDoesNotMatchTheWorkspace",
					});
				}
				v2ProjectId = workspace.projectId;
			}
			// No project and no pin = session automation: each run creates a
			// project-less session workspace on the host.

			if (targetHostId && targetHostId !== input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					targetHostId,
				);
			}

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
						targetHostId,
						v2ProjectId,
						v2WorkspaceId: input.v2WorkspaceId ?? null,
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
				await joinSlackTriggerChannels(organizationId, input.triggers);
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

			if (input.targetHostId !== undefined && input.targetHostId !== null) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}

			let nextTargetHostId =
				input.targetHostId === undefined
					? existing.targetHostId
					: input.targetHostId;
			// Explicit null switches to session mode; undefined keeps the project.
			let nextProjectId =
				input.v2ProjectId === undefined
					? existing.v2ProjectId
					: input.v2ProjectId;
			let nextWorkspaceId =
				input.v2WorkspaceId === undefined
					? existing.v2WorkspaceId
					: input.v2WorkspaceId;

			if (input.v2WorkspaceId === undefined) {
				const targetHostChanged =
					input.targetHostId !== undefined &&
					input.targetHostId !== existing.targetHostId;
				const projectChanged =
					input.v2ProjectId !== undefined &&
					input.v2ProjectId !== existing.v2ProjectId;
				if (targetHostChanged || projectChanged) {
					nextWorkspaceId = null;
				}
			}

			if (input.v2WorkspaceId && input.targetHostId) {
				// Denormalized pin (see create): the client supplies host (and
				// project, when the workspace has one) with the workspace id; no
				// workspace registry lookup. A null project = session pin.
				nextProjectId = input.v2ProjectId ?? null;
				nextTargetHostId = input.targetHostId;
			} else if (input.v2WorkspaceId) {
				// Legacy clients changing the pin — resolve via the cloud table
				// while it still exists; this branch is deleted in R3. A merely
				// retained pin is never re-resolved here: hosts own workspace
				// records, and session pins have no cloud row at all.
				const workspace = await verifyWorkspaceInOrg(
					organizationId,
					input.v2WorkspaceId,
				);
				// Mirror create: derive the project from the workspace and only
				// reject when the caller *explicitly* passed a conflicting project.
				// Otherwise a legitimate cross-project workspace move (sending only
				// v2WorkspaceId) would be wrongly rejected as a mismatch.
				if (
					input.v2ProjectId !== undefined &&
					input.v2ProjectId !== workspace.projectId
				) {
					throw userError({
						code: "BAD_REQUEST",
						message: "v2ProjectId does not match the workspace's project",
						i18nKey:
							"serverError.automation.v2projectidDoesNotMatchTheWorkspace",
					});
				}
				nextProjectId = workspace.projectId;
				if (
					input.targetHostId !== undefined &&
					input.targetHostId !== null &&
					input.targetHostId !== workspace.hostId
				) {
					throw userError({
						code: "BAD_REQUEST",
						message: "targetHostId does not match the workspace's host",
						i18nKey:
							"serverError.automation.targethostidDoesNotMatchTheWorkspace",
					});
				}
				nextTargetHostId = workspace.hostId;
			}
			if (
				nextTargetHostId &&
				nextTargetHostId !== existing.targetHostId &&
				nextTargetHostId !== input.targetHostId
			) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					nextTargetHostId,
				);
			}

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
						targetHostId: nextTargetHostId,
						v2ProjectId: nextProjectId,
						v2WorkspaceId: nextWorkspaceId,
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
				await joinSlackTriggerChannels(organizationId, input.triggers);
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
				throw userError({
					code: "NOT_FOUND",
					message: "Automation not found",
					i18nKey: "serverError.automation.automationNotFound",
				});
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
			await getAutomationForUser(ctx.session.user.id, organizationId, input.id);

			await db.delete(automations).where(eq(automations.id, input.id));

			return { ok: true };
		}),

	setEnabled: protectedProcedure
		.input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
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
			const organizationId = await requireActiveOrgMembership(ctx);
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

			return db
				.select()
				.from(automationRuns)
				.where(eq(automationRuns.automationId, input.automationId))
				.orderBy(desc(automationRuns.createdAt))
				.limit(input.limit);
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
				chatSessionId: automationRuns.chatSessionId,
				terminalSessionId: automationRuns.terminalSessionId,
			})
			.from(automationRuns)
			.where(eq(automationRuns.organizationId, organizationId))
			.orderBy(automationRuns.automationId, desc(automationRuns.createdAt));
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
