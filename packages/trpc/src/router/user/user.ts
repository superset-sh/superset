import { db } from "@superset/db/client";
import { organizationMembers, users } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
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
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "User record not found",
			});
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
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "User record not found",
			});
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
