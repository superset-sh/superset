import { db } from "@superset/db/client";
import { members, organizations } from "@superset/db/schema";
import { sessions as authSessions } from "@superset/db/schema/auth";
import { canRemoveMember, type OrganizationRole } from "@superset/shared/auth";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
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
				id: z.string(),
				name: z.string().min(1).optional(),
				logo: z.string().url().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { id, ...data } = input;
			const [organization] = await db
				.update(organizations)
				.set(data)
				.where(eq(organizations.id, id))
				.returning();
			return organization;
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
					memberIdOrEmail: input.userId,
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
			console.log(
				"[organization/leave] START - userId:",
				ctx.session.user.id,
				"orgId:",
				input.organizationId,
			);
			console.log(
				"[organization/leave] Current activeOrganizationId:",
				ctx.session.session.activeOrganizationId,
			);

			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.organizationId, input.organizationId),
					eq(members.userId, ctx.session.user.id),
				),
			});

			if (!membership) {
				console.log(
					"[organization/leave] ERROR - User is not a member of this organization",
				);
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "You are not a member of this organization",
				});
			}

			console.log(
				"[organization/leave] Calling Better Auth leaveOrganization API",
			);
			const leaveResult = await ctx.auth.api.leaveOrganization({
				body: { organizationId: input.organizationId },
				headers: ctx.headers,
			});

			if (!leaveResult) {
				console.log(
					"[organization/leave] ERROR - Better Auth leaveOrganization failed",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to leave organization",
				});
			}

			console.log(
				"[organization/leave] Successfully left organization via Better Auth",
			);

			const otherMembership = await db.query.members.findFirst({
				where: and(
					eq(members.userId, ctx.session.user.id),
					ne(members.organizationId, input.organizationId),
				),
			});

			console.log(
				"[organization/leave] Other membership found:",
				otherMembership?.organizationId ?? "null",
			);

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

			console.log(
				"[organization/leave] Updated all sessions to new activeOrganizationId:",
				otherMembership?.organizationId ?? "null",
			);
			console.log("[organization/leave] COMPLETE - Returning success");

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
