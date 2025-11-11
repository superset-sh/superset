import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../trpc";

export const userRouter = {
	all: publicProcedure.query(({ ctx }) => {
		return ctx.db.query.users.findMany({
			orderBy: desc(users.createdAt),
		});
	}),

	byId: publicProcedure.input(z.string().uuid()).query(({ ctx, input }) => {
		return ctx.db.query.users.findFirst({
			where: eq(users.id, input),
		});
	}),

	byEmail: publicProcedure.input(z.string().email()).query(({ ctx, input }) => {
		return ctx.db.query.users.findFirst({
			where: eq(users.email, input),
		});
	}),
} satisfies TRPCRouterRecord;
