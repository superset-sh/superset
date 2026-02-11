import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { del, put } from "@vercel/blob";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../trpc";

export const userRouter = {
	me: protectedProcedure.query(({ ctx }) => ctx.session.user),

	myOrganization: protectedProcedure.query(async ({ ctx }) => {
		const activeOrganizationId = ctx.session.session.activeOrganizationId;

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

			const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp"];
			if (!allowedMimeTypes.includes(input.mimeType)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid image type. Only PNG, JPEG, and WebP are allowed",
				});
			}

			const base64Data = input.fileData.includes("base64,")
				? input.fileData.split("base64,")[1] || input.fileData
				: input.fileData;
			const buffer = Buffer.from(base64Data, "base64");

			const sizeInMB = buffer.length / (1024 * 1024);
			if (sizeInMB > 4.5) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `File too large (${sizeInMB.toFixed(2)}MB). Maximum size is 4.5MB`,
				});
			}

			if (user.image) {
				try {
					await del(user.image);
				} catch {
					// Old avatar doesn't exist or isn't in blob storage - that's fine
				}
			}

			const ext = input.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
			const randomId = Math.random().toString(36).substring(2, 15);
			const pathname = `user/${userId}/avatar/${randomId}.${ext}`;

			try {
				const blob = await put(pathname, buffer, {
					access: "public",
					contentType: input.mimeType,
				});

				const [updatedUser] = await db
					.update(users)
					.set({ image: blob.url })
					.where(eq(users.id, userId))
					.returning();

				return {
					success: true,
					url: blob.url,
					user: updatedUser,
				};
			} catch (error) {
				console.error("[user/uploadAvatar] Upload failed:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to upload avatar",
				});
			}
		}),
} satisfies TRPCRouterRecord;
