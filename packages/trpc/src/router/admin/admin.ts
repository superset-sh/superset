import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../../trpc";

export const adminRouter = {
	listUsers: adminProcedure.query(() => {
		return db.query.users.findMany({
			orderBy: desc(users.createdAt),
		});
	}),

	deleteUser: adminProcedure
		.input(z.object({ userId: z.string() }))
		.mutation(async ({ input }) => {
			// Delete user - Better Auth handles cascading session cleanup
			await db.delete(users).where(eq(users.id, input.userId));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
