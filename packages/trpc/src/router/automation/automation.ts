import { db, dbWs } from "@superset/db/client";
import {
	automationRuns,
	automations,
	type SelectSubscription,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import {
	isActiveSubscriptionStatus,
	isPaidPlan,
} from "@superset/shared/billing";
import {
	describeSchedule,
	nextOccurrences,
	parseRrule,
} from "@superset/shared/rrule";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, getTableColumns, ilike } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure } from "../../trpc";
import {
	requireActiveOrgMembership,
	requireActiveOrgMembershipWithSubscription,
} from "../utils/active-org";
import { dispatchAutomation } from "./dispatch";
import {
	getAutomationForUser,
	promptSourceFromSession,
	recordPromptVersion,
} from "./helpers";
import {
	createAutomationSchema,
	listRunsSchema,
	parseRruleSchema,
	setAutomationPromptSchema,
	updateAutomationSchema,
} from "./schema";
import { automationVersionsRouter } from "./versions";

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function requirePaidSubscription(subscription: SelectSubscription | null) {
	if (
		!subscription ||
		!isPaidPlan(subscription.plan) ||
		!isActiveSubscriptionStatus(subscription.status)
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Automations require a Pro plan",
		});
	}
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
			message: "Host not found",
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
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You don't have access to this host",
		});
	}
}

async function verifyWorkspaceInOrg(
	organizationId: string,
	workspaceId: string,
): Promise<{ id: string; projectId: string }> {
	const [workspace] = await db
		.select({
			id: v2Workspaces.id,
			organizationId: v2Workspaces.organizationId,
			projectId: v2Workspaces.projectId,
		})
		.from(v2Workspaces)
		.where(eq(v2Workspaces.id, workspaceId))
		.limit(1);

	if (!workspace || workspace.organizationId !== organizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}
	return { id: workspace.id, projectId: workspace.projectId };
}

async function verifyProjectInOrg(organizationId: string, projectId: string) {
	const [project] = await db
		.select({ id: v2Projects.id, organizationId: v2Projects.organizationId })
		.from(v2Projects)
		.where(eq(v2Projects.id, projectId))
		.limit(1);

	if (!project || project.organizationId !== organizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project not found",
		});
	}
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

			const { prompt: _prompt, ...summaryCols } = getTableColumns(automations);
			const rows = await db
				.select(summaryCols)
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

			return rows.map((row) => ({
				...row,
				scheduleText: safeDescribeRrule(row),
			}));
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

			const { prompt: _prompt, ...summaryCols } = getTableColumns(automations);
			const [row] = await db
				.select(summaryCols)
				.from(automations)
				.where(
					and(
						eq(automations.id, input.id),
						eq(automations.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!row || row.ownerUserId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Automation not found",
				});
			}

			return { ...row, scheduleText: safeDescribeRrule(row) };
		}),

	create: protectedProcedure
		.input(createAutomationSchema)
		.mutation(async ({ ctx, input }) => {
			const { organizationId, subscription } =
				await requireActiveOrgMembershipWithSubscription(ctx);
			requirePaidSubscription(subscription);

			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}

			let v2ProjectId = input.v2ProjectId;
			if (input.v2WorkspaceId) {
				const workspace = await verifyWorkspaceInOrg(
					organizationId,
					input.v2WorkspaceId,
				);
				if (v2ProjectId && v2ProjectId !== workspace.projectId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "v2ProjectId does not match the workspace's project",
					});
				}
				v2ProjectId = workspace.projectId;
			} else if (v2ProjectId) {
				await verifyProjectInOrg(organizationId, v2ProjectId);
			}

			if (!v2ProjectId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "v2ProjectId required when v2WorkspaceId is not provided",
				});
			}

			const dtstart = input.dtstart ?? new Date();
			const { nextRunAt } = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			});

			const created = await dbWs.transaction(async (tx) => {
				const inserted = await tx
					.insert(automations)
					.values({
						organizationId,
						ownerUserId: ctx.session.user.id,
						name: input.name,
						prompt: input.prompt,
						agentConfig: input.agentConfig,
						targetHostId: input.targetHostId ?? null,
						v2ProjectId,
						v2WorkspaceId: input.v2WorkspaceId ?? null,
						rrule: input.rrule,
						dtstart,
						timezone: input.timezone,
						mcpScope: input.mcpScope,
						nextRunAt,
					})
					.returning();

				const row = inserted[0];
				if (!row) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create automation",
					});
				}

				await recordPromptVersion(tx, {
					automationId: row.id,
					authorUserId: ctx.session.user.id,
					content: input.prompt,
					source: promptSourceFromSession(ctx.session),
				});

				return row;
			});

			return { ...created, scheduleText: safeDescribeRrule(created) };
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
			if (input.v2WorkspaceId) {
				await verifyWorkspaceInOrg(organizationId, input.v2WorkspaceId);
			}

			const nextRrule = input.rrule ?? existing.rrule;
			const nextDtstart = input.dtstart ?? existing.dtstart;
			const nextTimezone = input.timezone ?? existing.timezone;
			const recurrenceChanged =
				input.rrule !== undefined ||
				input.dtstart !== undefined ||
				input.timezone !== undefined;

			const recomputedNextRunAt = recurrenceChanged
				? parseRrule({
						rrule: nextRrule,
						dtstart: nextDtstart,
						timezone: nextTimezone,
					}).nextRunAt
				: existing.nextRunAt;

			const [updated] = await dbWs
				.update(automations)
				.set({
					name: input.name ?? existing.name,
					agentConfig: input.agentConfig ?? existing.agentConfig,
					targetHostId:
						input.targetHostId === undefined
							? existing.targetHostId
							: input.targetHostId,
					v2ProjectId: input.v2ProjectId ?? existing.v2ProjectId,
					v2WorkspaceId:
						input.v2WorkspaceId === undefined
							? existing.v2WorkspaceId
							: input.v2WorkspaceId,
					rrule: nextRrule,
					dtstart: nextDtstart,
					timezone: nextTimezone,
					mcpScope: input.mcpScope ?? existing.mcpScope,
					nextRunAt: recomputedNextRunAt,
				})
				.where(eq(automations.id, input.id))
				.returning();

			return { ...updated, scheduleText: safeDescribeRrule(updated) };
		}),

	getPrompt: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);
			return { id: existing.id, prompt: existing.prompt };
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
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Automation not found",
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

			return { ...updated, scheduleText: safeDescribeRrule(updated) };
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getAutomationForUser(ctx.session.user.id, organizationId, input.id);

			await dbWs.delete(automations).where(eq(automations.id, input.id));

			return { ok: true };
		}),

	setEnabled: protectedProcedure
		.input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const { organizationId, subscription } =
				await requireActiveOrgMembershipWithSubscription(ctx);
			if (input.enabled) {
				requirePaidSubscription(subscription);
			}
			const existing = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			// When resuming, recompute next_run_at from now so we don't fire stale
			// occurrences that accumulated while paused.
			const patch: { enabled: boolean; nextRunAt?: Date } = {
				enabled: input.enabled,
			};
			if (input.enabled && !existing.enabled) {
				patch.nextRunAt = parseRrule({
					rrule: existing.rrule,
					dtstart: existing.dtstart,
					timezone: existing.timezone,
					after: new Date(),
				}).nextRunAt;
			}

			const [updated] = await dbWs
				.update(automations)
				.set(patch)
				.where(eq(automations.id, input.id))
				.returning();

			return { ...updated, scheduleText: safeDescribeRrule(updated) };
		}),

	runNow: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { organizationId, subscription } =
				await requireActiveOrgMembershipWithSubscription(ctx);
			requirePaidSubscription(subscription);
			const automation = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			const outcome = await dispatchAutomation({
				automation,
				scheduledFor: new Date(),
				relayUrl: env.RELAY_URL,
			});

			if (outcome.status === "conflict") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "A run for this automation is already in progress.",
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
			if (outcome.status === "skipped_unpaid") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: outcome.error,
				});
			}

			return { automationId: automation.id, runId: outcome.runId };
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

function safeDescribeRrule(row: { rrule: string } | null | undefined): string {
	if (!row) return "";
	try {
		return describeSchedule(row.rrule);
	} catch {
		return row.rrule;
	}
}

export { bucketToMinute };
