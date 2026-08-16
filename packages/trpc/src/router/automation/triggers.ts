import { db, dbWs } from "@superset/db/client";
import { automationTriggers, type TriggerConfig } from "@superset/db/schema";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";

import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getAutomationForUser } from "./helpers";
import {
	createTriggerSchema,
	deleteTriggerSchema,
	listTriggersSchema,
	updateTriggerSchema,
} from "./triggerSchema";

/**
 * Schedule triggers carry their next firing time in a column so the dispatcher
 * can index it; every other kind fires on an event and has none.
 */
function nextRunAtFor(config: TriggerConfig): Date | null {
	if (config.kind !== "schedule") return null;
	return nextOccurrenceAfter({
		rrule: config.rrule,
		dtstart: new Date(config.dtstart),
		timezone: config.timezone,
		after: new Date(),
	});
}

/** Ownership is checked against the automation — triggers have no owner. */
async function requireTriggerForUser(
	userId: string,
	organizationId: string,
	triggerId: string,
) {
	const [trigger] = await db
		.select()
		.from(automationTriggers)
		.where(
			and(
				eq(automationTriggers.id, triggerId),
				eq(automationTriggers.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!trigger) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Trigger not found" });
	}
	await getAutomationForUser(userId, organizationId, trigger.automationId);
	return trigger;
}

export const automationTriggersRouter = {
	list: protectedProcedure
		.input(listTriggersSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return db
				.select()
				.from(automationTriggers)
				.where(
					and(
						eq(automationTriggers.organizationId, organizationId),
						input.automationId
							? eq(automationTriggers.automationId, input.automationId)
							: undefined,
					),
				)
				.orderBy(asc(automationTriggers.createdAt));
		}),

	create: protectedProcedure
		.input(createTriggerSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			// Ownership, and it proves the automation is in this org — the composite
			// FK would reject a mismatch anyway, as a 500 rather than a 404.
			await getAutomationForUser(
				ctx.session.user.id,
				organizationId,
				input.automationId,
			);

			if (input.kind === "schedule") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"An automation's schedule is edited through automation.update",
				});
			}

			const [created] = await dbWs
				.insert(automationTriggers)
				.values({
					automationId: input.automationId,
					organizationId,
					kind: input.kind,
					config: input.config,
					enabled: input.enabled,
					nextRunAt: nextRunAtFor(input.config),
				})
				.returning();

			return created;
		}),

	update: protectedProcedure
		.input(updateTriggerSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await requireTriggerForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			if (input.config && input.config.kind !== existing.kind) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot change a ${existing.kind} trigger into a ${input.config.kind} trigger`,
				});
			}
			if (existing.kind === "schedule" && input.config) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"An automation's schedule is edited through automation.update",
				});
			}

			const [updated] = await dbWs
				.update(automationTriggers)
				.set({
					config: input.config ?? existing.config,
					enabled: input.enabled ?? existing.enabled,
					...(input.config ? { nextRunAt: nextRunAtFor(input.config) } : {}),
				})
				.where(eq(automationTriggers.id, input.id))
				.returning();

			return updated;
		}),

	delete: protectedProcedure
		.input(deleteTriggerSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await requireTriggerForUser(
				ctx.session.user.id,
				organizationId,
				input.id,
			);

			// Deleting it would leave the automation with nothing to fire it, and
			// the dispatcher inner-joins the schedule trigger, so the automation
			// would silently vanish from every listing.
			if (existing.kind === "schedule") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"An automation's schedule trigger cannot be removed; disable the automation instead",
				});
			}

			await dbWs
				.delete(automationTriggers)
				.where(eq(automationTriggers.id, input.id));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
