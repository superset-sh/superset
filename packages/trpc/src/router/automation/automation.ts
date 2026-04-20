import { db, dbWs } from "@superset/db/client";
import {
	automationRuns,
	automations,
	v2Hosts,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import {
	describeSchedule,
	nextOccurrences,
	parseRrule,
} from "@superset/shared/rrule";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { dispatchAutomation } from "./dispatch";
import {
	createAutomationSchema,
	listRunsSchema,
	parseRruleSchema,
	updateAutomationSchema,
} from "./schema";

async function verifyHostAccess(
	userId: string,
	organizationId: string,
	hostId: string,
): Promise<void> {
	const [host] = await db
		.select({ id: v2Hosts.id, organizationId: v2Hosts.organizationId })
		.from(v2Hosts)
		.where(eq(v2Hosts.id, hostId))
		.limit(1);

	if (!host || host.organizationId !== organizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Host not found",
		});
	}

	const [membership] = await db
		.select({ id: v2UsersHosts.id })
		.from(v2UsersHosts)
		.where(
			and(eq(v2UsersHosts.userId, userId), eq(v2UsersHosts.hostId, hostId)),
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
): Promise<void> {
	const [workspace] = await db
		.select({
			id: v2Workspaces.id,
			organizationId: v2Workspaces.organizationId,
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
}

async function getAutomationForUser(
	userId: string,
	organizationId: string,
	id: string,
) {
	const [automation] = await db
		.select()
		.from(automations)
		.where(
			and(
				eq(automations.id, id),
				eq(automations.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!automation || automation.ownerUserId !== userId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Automation not found",
		});
	}

	return automation;
}

export const automationRouter = {
	/** List automations scoped to the caller's active organization. */
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx.session);

		const rows = await db
			.select()
			.from(automations)
			.where(eq(automations.organizationId, organizationId))
			.orderBy(desc(automations.createdAt));

		return rows.map((row) => ({
			...row,
			scheduleText: safeDescribeRrule(row),
		}));
	}),

	/** Get one automation plus the last 10 runs. */
	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			const automation = await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			const recentRuns = await db
				.select()
				.from(automationRuns)
				.where(eq(automationRuns.automationId, input.id))
				.orderBy(desc(automationRuns.createdAt))
				.limit(10);

			return {
				...automation,
				scheduleText: safeDescribeRrule(automation),
				recentRuns,
			};
		}),

	create: protectedProcedure
		.input(createAutomationSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);

			if (input.targetHostId) {
				await verifyHostAccess(
					ctx.session.user.id,
					organizationId,
					input.targetHostId,
				);
			}
			if (input.v2WorkspaceId) {
				await verifyWorkspaceInOrg(organizationId, input.v2WorkspaceId);
			}

			const dtstart = input.dtstart ?? new Date();
			const { nextRunAt } = parseRrule({
				rrule: input.rrule,
				dtstart,
				timezone: input.timezone,
			});

			const [created] = await dbWs
				.insert(automations)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					name: input.name,
					prompt: input.prompt,
					agentConfig: input.agentConfig,
					targetHostId: input.targetHostId ?? null,
					v2ProjectId: input.v2ProjectId,
					v2WorkspaceId: input.v2WorkspaceId ?? null,
					rrule: input.rrule,
					dtstart,
					timezone: input.timezone,
					mcpScope: input.mcpScope,
					nextRunAt,
				})
				.returning();

			return { ...created, scheduleText: safeDescribeRrule(created) };
		}),

	update: protectedProcedure
		.input(updateAutomationSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
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
					prompt: input.prompt ?? existing.prompt,
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

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
			await getAutomationForUser(ctx.session.user.id, organizationId, input.id);

			await dbWs.delete(automations).where(eq(automations.id, input.id));

			return { ok: true };
		}),

	setEnabled: protectedProcedure
		.input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
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
			const organizationId = await requireActiveOrgMembership(ctx.session);
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

			return { automationId: automation.id, runId: outcome.runId };
		}),

	/** Run history for a given automation (paginated). */
	listRuns: protectedProcedure
		.input(listRunsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx.session);
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
