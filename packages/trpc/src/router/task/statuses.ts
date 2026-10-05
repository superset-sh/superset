import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export const taskStatusesRouter = {
	list: protectedProcedure
		.input(z.object({ nativeOnly: z.boolean() }).optional())
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return db
				.select()
				.from(taskStatuses)
				.where(
					and(
						eq(taskStatuses.organizationId, organizationId),
						input?.nativeOnly
							? isNull(taskStatuses.externalProvider)
							: undefined,
					),
				)
				.orderBy(taskStatuses.position);
		}),
} satisfies TRPCRouterRecord;
