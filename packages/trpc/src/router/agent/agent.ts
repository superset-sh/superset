import { db } from "@superset/db/client";
import { agentCommands, commandStatusValues } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

export const agentRouter = {
	/**
	 * Update a command's status (called by device executors via Electric sync)
	 */
	updateCommand: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				status: z.enum(commandStatusValues),
				claimedBy: z.string().optional(),
				claimedAt: z.date().optional(),
				result: z.record(z.string(), z.unknown()).optional(),
				error: z.string().optional(),
				executedAt: z.date().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization selected",
				});
			}

			const [existingCommand] = await db
				.select()
				.from(agentCommands)
				.where(
					and(
						eq(agentCommands.id, input.id),
						eq(agentCommands.organizationId, organizationId),
					),
				);

			if (!existingCommand) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Command not found",
				});
			}

			const updateData: Partial<typeof agentCommands.$inferInsert> = {
				status: input.status,
			};

			if (input.claimedBy !== undefined) {
				updateData.claimedBy = input.claimedBy;
			}
			if (input.claimedAt !== undefined) {
				updateData.claimedAt = input.claimedAt;
			}
			if (input.result !== undefined) {
				updateData.result = input.result;
			}
			if (input.error !== undefined) {
				updateData.error = input.error;
			}
			if (input.executedAt !== undefined) {
				updateData.executedAt = input.executedAt;
			}

			const [updated] = await db
				.update(agentCommands)
				.set(updateData)
				.where(eq(agentCommands.id, input.id))
				.returning();

			return { command: updated, txid: BigInt(Date.now()) };
		}),
} satisfies TRPCRouterRecord;
