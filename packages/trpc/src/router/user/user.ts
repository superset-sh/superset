import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../trpc";
import { syncUserFromClerk } from "./utils/sync-user-from-clerk";

export const userRouter = {
	me: protectedProcedure.query(async ({ ctx }) => {
		const existingUser = await db.query.users.findFirst({
			where: eq(users.clerkId, ctx.userId),
		});

		if (existingUser) {
			return existingUser;
		}

		return syncUserFromClerk(ctx.userId);
	}),
} satisfies TRPCRouterRecord;
