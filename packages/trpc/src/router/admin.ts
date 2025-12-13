import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../trpc";

export const adminRouter = {
	listActiveUsers: adminProcedure.query(() => {
		return db.query.users.findMany({
			where: isNull(users.deletedAt),
			orderBy: desc(users.createdAt),
		});
	}),

	listDeletedUsers: adminProcedure.query(() => {
		return db.query.users.findMany({
			where: isNotNull(users.deletedAt),
			orderBy: desc(users.deletedAt),
		});
	}),

	restoreUser: adminProcedure
		.input(z.object({ userId: z.string().uuid() }))
		.mutation(async ({ input }) => {
			const [user] = await db
				.update(users)
				.set({ deletedAt: null })
				.where(eq(users.id, input.userId))
				.returning();

			if (!user) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			return user;
		}),

	permanentlyDeleteUser: adminProcedure
		.input(z.object({ userId: z.string().uuid() }))
		.mutation(async () => {
			// TODO: Implement Clerk user deletion, avatar cleanup, etc.
			throw new TRPCError({
				code: "NOT_IMPLEMENTED",
				message:
					"Permanent deletion not yet implemented - requires Clerk cleanup",
			});
		}),
} satisfies TRPCRouterRecord;
