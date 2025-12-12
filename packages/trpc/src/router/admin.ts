import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { desc } from "drizzle-orm";

import { adminProcedure } from "../trpc";

export const adminRouter = {
	listUsers: adminProcedure.query(() => {
		return db.query.users.findMany({
			orderBy: desc(users.createdAt),
		});
	}),
} satisfies TRPCRouterRecord;
