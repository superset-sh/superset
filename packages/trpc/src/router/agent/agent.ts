import { dbWs } from "@superset/db/client";
import { agentCommands, commandStatusValues } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
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
				status: z.enum(commandStatusValues).optional(),
				result: z.record(z.string(), z.unknown()).nullable().optional(),
				error: z.string().nullable().optional(),
				executedAt: z.date().nullable().optional(),
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

			const { id, ...changes } = input;

			const result = await dbWs.transaction(async (tx) => {
				const [existingCommand] = await tx
					.select()
					.from(agentCommands)
					.where(
						and(
							eq(agentCommands.id, id),
							eq(agentCommands.organizationId, organizationId),
							eq(agentCommands.userId, ctx.session.user.id),
						),
					);

				if (!existingCommand) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Command not found",
					});
				}

				const [updated] = await tx
					.update(agentCommands)
					.set(changes)
					.where(eq(agentCommands.id, id))
					.returning();

				const txid = await getCurrentTxid(tx);

				return { command: updated, txid };
			});

			return result;
		}),
} satisfies TRPCRouterRecord;
