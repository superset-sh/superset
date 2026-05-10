import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export const taskStatusesRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select({
				id: taskStatuses.id,
				name: taskStatuses.name,
				color: taskStatuses.color,
				type: taskStatuses.type,
				position: taskStatuses.position,
			})
			.from(taskStatuses)
			.where(eq(taskStatuses.organizationId, organizationId))
			.orderBy(taskStatuses.position);
	}),
} satisfies TRPCRouterRecord;
