import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../trpc";

export const userRouter = {
	me: protectedProcedure.query(async ({ ctx }) => {
		return db.query.users.findFirst({
			where: eq(users.clerkId, ctx.session.userId),
		});
	}),

	byId: protectedProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.users.findFirst({
			where: eq(users.id, input),
		});
	}),
} satisfies TRPCRouterRecord;
