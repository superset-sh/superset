import { db } from "@superset/db/client";
import {
	members,
	oauthAccessTokens,
	oauthRefreshTokens,
	sessions,
	users,
} from "@superset/db/schema";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@superset/shared/constants";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { emitAppFirstOpened } from "../../lib/activation-events";
import { generateImagePathname, uploadImage } from "../../lib/upload";
import { protectedProcedure } from "../../trpc";

export const userRouter = {
	me: protectedProcedure.query(({ ctx }) => ctx.session.user),

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

	/** Grace-period deletion: marks the account and revokes every live
	 * credential (sessions + issued OAuth tokens). Orgs and billing are left
	 * untouched so reactivation within the window restores everything; purge
	 * happens later via admin.deleteUser. */
	deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
		const userId = ctx.session.user.id;

		const ownerships = await db.query.members.findMany({
			where: and(eq(members.userId, userId), eq(members.role, "owner")),
		});
		for (const ownership of ownerships) {
			const [otherMembers] = await db
				.select({ value: count() })
				.from(members)
				.where(
					and(
						eq(members.organizationId, ownership.organizationId),
						ne(members.userId, userId),
					),
				);
			if ((otherMembers?.value ?? 0) === 0) continue;

			const [otherOwners] = await db
				.select({ value: count() })
				.from(members)
				.where(
					and(
						eq(members.organizationId, ownership.organizationId),
						eq(members.role, "owner"),
						ne(members.userId, userId),
					),
				);
			if ((otherOwners?.value ?? 0) === 0) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"You are the only owner of an organization that has other members. Transfer ownership or delete the organization first.",
				});
			}
		}

		await db
			.update(users)
			.set({ deletionRequestedAt: new Date() })
			.where(eq(users.id, userId));
		await db.delete(sessions).where(eq(sessions.userId, userId));
		await db
			.delete(oauthAccessTokens)
			.where(eq(oauthAccessTokens.userId, userId));
		await db
			.delete(oauthRefreshTokens)
			.where(eq(oauthRefreshTokens.userId, userId));
		return { success: true };
	}),

	reactivateAccount: protectedProcedure.mutation(async ({ ctx }) => {
		const userId = ctx.session.user.id;

		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { deletionRequestedAt: true },
		});
		if (!user?.deletionRequestedAt) return { success: true };

		const graceMs = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
		if (Date.now() - user.deletionRequestedAt.getTime() > graceMs) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "The recovery period has ended. Contact support@superset.sh.",
			});
		}

		await db
			.update(users)
			.set({ deletionRequestedAt: null })
			.where(eq(users.id, userId));
		return { success: true };
	}),

	completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
		const userId = ctx.session.user.id;
		const existing = await db.query.users.findFirst({
			columns: { email: true, createdAt: true, onboardedAt: true },
			where: eq(users.id, userId),
		});
		const [updatedUser] = await db
			.update(users)
			.set({ onboardedAt: new Date() })
			.where(eq(users.id, userId))
			.returning();
		// Onboarding completes inside the installed app, which makes it the
		// broadest first-opened signal (~84% of signups vs ~5% via v2 host
		// registration); only the first completion counts.
		if (existing && !existing.onboardedAt) {
			await emitAppFirstOpened(existing, userId, "user.completeOnboarding");
		}
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
