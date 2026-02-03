import { stripeClient } from "@superset/auth/stripe";
import { db } from "@superset/db/client";
import { members, organizations } from "@superset/db/schema";
import {
	sessions as authSessions,
	invitations,
} from "@superset/db/schema/auth";
import { canRemoveMember, type OrganizationRole } from "@superset/shared/auth";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { del, put } from "@vercel/blob";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../trpc";

export const organizationRouter = {
	all: publicProcedure.query(() => {
		return db.query.organizations.findMany({
			orderBy: desc(organizations.createdAt),
			with: {
				members: {
					with: {
						user: true,
					},
				},
			},
		});
	}),

	byId: publicProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.organizations.findFirst({
			where: eq(organizations.id, input),
			with: {
				members: {
					with: {
						user: true,
					},
				},
				repositories: true,
			},
		});
	}),

	bySlug: publicProcedure.input(z.string()).query(({ input }) => {
		return db.query.organizations.findFirst({
			where: eq(organizations.slug, input),
			with: {
				members: {
					with: {
						user: true,
					},
				},
				repositories: true,
			},
		});
	}),

	getInvitation: publicProcedure.input(z.uuid()).query(async ({ input }) => {
		const invitation = await db.query.invitations.findFirst({
			where: eq(invitations.id, input),
			with: {
				organization: true,
				inviter: true,
			},
		});

		if (!invitation) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Invitation not found",
			});
		}

		// Check if invitation is expired
		const isExpired = new Date(invitation.expiresAt) < new Date();

		return {
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			isExpired,
			organization: {
				id: invitation.organization.id,
				name: invitation.organization.name,
				slug: invitation.organization.slug,
				logo: invitation.organization.logo,
			},
			inviter: {
				id: invitation.inviter.id,
				name: invitation.inviter.name,
				email: invitation.inviter.email,
				image: invitation.inviter.image,
			},
		};
	}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				slug: z.string().min(1),
				logo: z.string().url().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [organization] = await db
				.insert(organizations)
				.values({
					name: input.name,
					slug: input.slug,
					logo: input.logo,
				})
				.returning();

			if (organization) {
				await db.insert(members).values({
					organizationId: organization.id,
					userId: ctx.session.user.id,
					role: "owner",
				});
			}

			return organization;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				slug: z
					.string()
					.min(3, "Slug must be at least 3 characters")
					.max(50)
					.regex(
						/^[a-z0-9-]+$/,
						"Slug can only contain lowercase letters, numbers, and hyphens",
					)
					.regex(/^[a-z0-9]/, "Slug must start with a letter or number")
					.regex(/[a-z0-9]$/, "Slug must end with a letter or number")
					.optional(),
				logo: z.string().url().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;

			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.organizationId, id),
					eq(members.userId, ctx.session.user.id),
				),
			});

			if (!membership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
				});
			}

			if (membership.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only owners can update organization settings",
				});
			}

			if (data.slug) {
				const existingOrg = await db.query.organizations.findFirst({
					where: and(
						eq(organizations.slug, data.slug),
						ne(organizations.id, id),
					),
				});

				if (existingOrg) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "This slug is already taken",
					});
				}
			}

			const [organization] = await db
				.update(organizations)
				.set(data)
				.where(eq(organizations.id, id))
				.returning();

			if (organization?.stripeCustomerId && data.name) {
				stripeClient.customers
					.update(organization.stripeCustomerId, {
						name: data.name,
					})
					.catch((error) => {
						console.error(
							"[org/update] Failed to sync Stripe customer info:",
							error,
						);
					});
			}

			return organization;
		}),

	uploadLogo: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				fileData: z.string(), // base64 string
				fileName: z.string(),
				mimeType: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.organizationId, input.organizationId),
					eq(members.userId, ctx.session.user.id),
				),
			});

			if (!membership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
				});
			}

			if (membership.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only owners can update organization settings",
				});
			}

			const organization = await db.query.organizations.findFirst({
				where: eq(organizations.id, input.organizationId),
			});

			if (!organization) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			if (organization.logo) {
				try {
					await del(organization.logo);
				} catch {
					// Old logo doesn't exist or isn't in blob storage - that's fine
				}
			}

			const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp"];
			if (!allowedMimeTypes.includes(input.mimeType)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid image type. Only PNG, JPEG, and WebP are allowed",
				});
			}

			const ext = input.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
			const randomId = Math.random().toString(36).substring(2, 15);
			const pathname = `organization/${input.organizationId}/logo/${randomId}.${ext}`;

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

			try {
				const blob = await put(pathname, buffer, {
					access: "public",
					contentType: input.mimeType,
				});

				const [updatedOrg] = await db
					.update(organizations)
					.set({ logo: blob.url })
					.where(eq(organizations.id, input.organizationId))
					.returning();

				return {
					success: true,
					url: blob.url,
					organization: updatedOrg,
				};
			} catch (error) {
				console.error("[organization/uploadLogo] Upload failed:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to upload logo",
				});
			}
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			await db.delete(organizations).where(eq(organizations.id, input));
			return { success: true };
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ input }) => {
			const [member] = await db
				.insert(members)
				.values({
					organizationId: input.organizationId,
					userId: input.userId,
					role: "member",
				})
				.returning();
			return member;
		}),

	removeMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				userId: z.uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const allMembers = await db.query.members.findMany({
				where: eq(members.organizationId, input.organizationId),
			});

			const targetMember = allMembers.find((m) => m.userId === input.userId);
			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Member not found",
				});
			}

			const actorMembership = allMembers.find(
				(m) => m.userId === ctx.session.user.id,
			);
			if (!actorMembership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
				});
			}

			const ownerCount = allMembers.filter((m) => m.role === "owner").length;
			const isTargetSelf = targetMember.userId === ctx.session.user.id;

			const canRemove = canRemoveMember(
				actorMembership.role as OrganizationRole,
				targetMember.role as OrganizationRole,
				isTargetSelf,
				ownerCount,
			);

			if (!canRemove) {
				if (isTargetSelf) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Cannot remove yourself",
					});
				}
				if (targetMember.role === "owner" && ownerCount === 1) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Cannot remove the last owner. Transfer ownership first.",
					});
				}
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You don't have permission to remove this member",
				});
			}

			await ctx.auth.api.removeMember({
				body: {
					organizationId: input.organizationId,
					memberIdOrEmail: targetMember.id, // Use member ID, not user ID
				},
				headers: ctx.headers,
			});

			return { success: true };
		}),

	leave: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.organizationId, input.organizationId),
					eq(members.userId, ctx.session.user.id),
				),
			});

			if (!membership) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "You are not a member of this organization",
				});
			}

			const leaveResult = await ctx.auth.api.leaveOrganization({
				body: { organizationId: input.organizationId },
				headers: ctx.headers,
			});

			if (!leaveResult) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to leave organization",
				});
			}

			const otherMembership = await db.query.members.findFirst({
				where: and(
					eq(members.userId, ctx.session.user.id),
					ne(members.organizationId, input.organizationId),
				),
			});

			await db
				.update(authSessions)
				.set({
					activeOrganizationId: otherMembership?.organizationId ?? null,
				})
				.where(
					and(
						eq(authSessions.userId, ctx.session.user.id),
						eq(authSessions.activeOrganizationId, input.organizationId),
					),
				);

			return {
				success: true,
				activeOrganizationId: otherMembership?.organizationId ?? null,
			};
		}),

	updateMemberRole: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
				role: z.enum(["owner", "admin", "member"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const allMembers = await db.query.members.findMany({
				where: eq(members.organizationId, input.organizationId),
			});

			const targetMember = allMembers.find((m) => m.id === input.memberId);
			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Member not found",
				});
			}

			const actorMembership = allMembers.find(
				(m) => m.userId === ctx.session.user.id,
			);
			if (!actorMembership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
				});
			}

			const actorRole = actorMembership.role as OrganizationRole;
			const targetRole = targetMember.role as OrganizationRole;
			const ownerCount = allMembers.filter((m) => m.role === "owner").length;

			if (actorRole === "admin" && targetRole === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Admins cannot modify owners",
				});
			}

			if (actorRole === "admin" && input.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Admins cannot promote members to owner",
				});
			}

			if (actorRole === "member") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Members cannot modify roles",
				});
			}

			if (
				targetRole === "owner" &&
				ownerCount === 1 &&
				input.role !== "owner"
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Cannot demote the last owner. Promote someone else first.",
				});
			}

			await ctx.auth.api.updateMemberRole({
				body: {
					organizationId: input.organizationId,
					memberId: input.memberId,
					role: [input.role],
				},
				headers: ctx.headers,
			});

			const updatedMember = await db.query.members.findFirst({
				where: eq(members.id, input.memberId),
			});

			return updatedMember;
		}),
} satisfies TRPCRouterRecord;
