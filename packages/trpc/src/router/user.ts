import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../trpc";

export const userRouter = {
	me: protectedProcedure.query(async ({ ctx }) => {
		return db.query.users.findFirst({
			where: eq(users.auth0Id, ctx.session.user.sub),
		});
	}),
} satisfies TRPCRouterRecord;
