import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../trpc";

export const userRouter = {
	me: protectedProcedure.query(({ ctx }) => ctx.session.user),

	myOrganization: protectedProcedure.query(async ({ ctx }) => {
		const membership = await db.query.members.findFirst({
			where: eq(members.userId, ctx.session.user.id),
			with: {
				organization: true,
			},
		});

		return membership?.organization ?? null;
	}),

	myOrganizations: protectedProcedure.query(async ({ ctx }) => {
		const memberships = await db.query.members.findMany({
			where: eq(members.userId, ctx.session.user.id),
			with: {
				organization: true,
			},
		});

		return memberships.map((m) => m.organization);
	}),
} satisfies TRPCRouterRecord;
