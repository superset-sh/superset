import { db } from "@superset/db/client";
import { organizationMembers, users } from "@superset/db/schema";
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

	myOrganization: protectedProcedure.query(async ({ ctx }) => {
		const user = await db.query.users.findFirst({
			where: eq(users.clerkId, ctx.userId),
		});

		if (!user) {
			return null;
		}

		const membership = await db.query.organizationMembers.findFirst({
			where: eq(organizationMembers.userId, user.id),
			with: {
				organization: true,
			},
		});

		return membership?.organization ?? null;
	}),

	myOrganizations: protectedProcedure.query(async ({ ctx }) => {
		const user = await db.query.users.findFirst({
			where: eq(users.clerkId, ctx.userId),
		});

		if (!user) {
			return [];
		}

		const memberships = await db.query.organizationMembers.findMany({
			where: eq(organizationMembers.userId, user.id),
			with: {
				organization: true,
			},
		});

		return memberships.map((m) => m.organization);
	}),
} satisfies TRPCRouterRecord;
