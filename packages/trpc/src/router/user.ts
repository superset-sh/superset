import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../trpc";

export const userRouter = {
	me: protectedProcedure.query(async ({ ctx }) => {
		return db.query.users.findFirst({
			where: eq(users.id, ctx.session.user.id),
		});
	}),

	all: publicProcedure.query(() => {
		return db.query.users.findMany({
			orderBy: desc(users.createdAt),
		});
	}),

	byId: publicProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.users.findFirst({
			where: eq(users.id, input),
		});
	}),

	byEmail: publicProcedure.input(z.string().email()).query(({ input }) => {
		return db.query.users.findFirst({
			where: eq(users.email, input),
		});
	}),
} satisfies TRPCRouterRecord;
