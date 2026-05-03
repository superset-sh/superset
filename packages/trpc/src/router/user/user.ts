import { db } from "@superset/db/client";
import { members, subscriptions, users } from "@superset/db/schema";
import {
	isActiveSubscriptionStatus,
	isPaidPlan,
} from "@superset/shared/billing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { generateImagePathname, uploadImage } from "../../lib/upload";
import { protectedProcedure } from "../../trpc";

const PLAN_TIER_RANK: Record<string, number> = {
	enterprise: 2,
	pro: 1,
	free: 0,
};

export const userRouter = {
	me: protectedProcedure.query(({ ctx }) => ctx.session.user),

	billingSummary: protectedProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select({
				organizationId: members.organizationId,
				plan: subscriptions.plan,
				status: subscriptions.status,
			})
			.from(members)
			.leftJoin(
				subscriptions,
				eq(subscriptions.referenceId, members.organizationId),
			)
			.where(eq(members.userId, ctx.session.user.id));

		const paying = rows.filter(
			(row) => isPaidPlan(row.plan) && isActiveSubscriptionStatus(row.status),
		);

		const best = paying
			.slice()
			.sort(
				(a, b) =>
					(PLAN_TIER_RANK[b.plan ?? ""] ?? 0) -
					(PLAN_TIER_RANK[a.plan ?? ""] ?? 0),
			)[0];

		return {
			isPaying: paying.length > 0,
			plan: best?.plan ?? null,
			subscriptionStatus: best?.status ?? null,
			payingOrganizationIds: paying.map((row) => row.organizationId),
		};
	}),

	myOrganization: protectedProcedure.query(async ({ ctx }) => {
		const activeOrganizationId = ctx.activeOrganizationId;

		const membership = await db.query.members.findFirst({
			where: activeOrganizationId
				? and(
						eq(members.userId, ctx.session.user.id),
						eq(members.organizationId, activeOrganizationId),
					)
				: eq(members.userId, ctx.session.user.id),
			orderBy: desc(members.createdAt),
			with: {
				organization: true,
			},
		});

		return membership?.organization ?? null;
	}),

	myOrganizations: protectedProcedure.query(async ({ ctx }) => {
		const memberships = await db.query.members.findMany({
			where: eq(members.userId, ctx.session.user.id),
			orderBy: desc(members.createdAt),
			with: {
				organization: true,
			},
		});

		return memberships.map((m) => m.organization);
	}),

	updateProfile: protectedProcedure
		.input(z.object({ name: z.string().min(1).max(100) }))
		.mutation(async ({ ctx, input }) => {
			const [updatedUser] = await db
				.update(users)
				.set({ name: input.name })
				.where(eq(users.id, ctx.session.user.id))
				.returning();
			return updatedUser;
		}),

	uploadAvatar: protectedProcedure
		.input(
			z.object({
				fileData: z.string(),
				fileName: z.string(),
				mimeType: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			const user = await db.query.users.findFirst({
				where: eq(users.id, userId),
			});

			if (!user) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			const pathname = generateImagePathname({
				prefix: `user/${userId}/avatar`,
				mimeType: input.mimeType,
			});

			try {
				const url = await uploadImage({
					fileData: input.fileData,
					mimeType: input.mimeType,
					pathname,
					existingUrl: user.image,
				});

				const [updatedUser] = await db
					.update(users)
					.set({ image: url })
					.where(eq(users.id, userId))
					.returning();

				return { success: true, url, user: updatedUser };
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				console.error("[user/uploadAvatar] Upload failed:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to upload avatar",
				});
			}
		}),
} satisfies TRPCRouterRecord;
