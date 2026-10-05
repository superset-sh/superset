import { db } from "@superset/db/client";
import { taskLabels } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertMember } from "../../lib/cloud-guards";
import { jwtProcedure } from "../../trpc";

export const taskLabelRouter = {
	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			return db
				.select({
					id: taskLabels.id,
					name: taskLabels.name,
					color: taskLabels.color,
				})
				.from(taskLabels)
				.where(eq(taskLabels.organizationId, input.organizationId))
				.orderBy(asc(taskLabels.name));
		}),
} satisfies TRPCRouterRecord;
