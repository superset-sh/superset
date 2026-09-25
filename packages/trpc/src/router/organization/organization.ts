import { auth } from "@superset/auth/server";
import { stripeClient } from "@superset/auth/stripe";
import { db } from "@superset/db/client";
import {
	members,
	organizations,
	teamMembers,
	teams,
	users,
} from "@superset/db/schema";
import {
	sessions as authSessions,
	invitations,
	verifications,
} from "@superset/db/schema/auth";
import { findOrgMembership } from "@superset/db/utils";
import { canRemoveMember, type OrganizationRole } from "@superset/shared/auth";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { generateImagePathname, uploadImage } from "../../lib/upload";
import {
	jwtProcedure,
	protectedProcedure,
	publicProcedure,
	userError,
} from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgMembership } from "../utils/active-org";
import { organizationMembersRouter } from "./members";

async function getInvitationById(invitationId: string) {
	const invitation = await db.query.invitations.findFirst({
		where: eq(invitations.id, invitationId),
		with: {
			organization: true,
			inviter: true,
		},
	});

	if (!invitation) {
		throw userError({
			code: "NOT_FOUND",
			message: "Invitation not found",
			i18nKey: "serverError.organization.invitationNotFound",
		});
	}

	return invitation;
}

function isInvitationExpired(expiresAt: Date) {
	return new Date(expiresAt) < new Date();
}

function verificationMatchesInvitation({
	verificationIdentifier,
	invitationId,
	invitationEmail,
}: {
	verificationIdentifier: string;
	invitationId: string;
	invitationEmail: string;
}) {
	return (
		verificationIdentifier === invitationId ||
		verificationIdentifier.toLowerCase() === invitationEmail.toLowerCase()
	);
}

export const organizationRouter = {
	members: organizationMembersRouter,

	list: protectedProcedure.query(async ({ ctx }) => {
		return db
			.select({
				id: organizations.id,
				name: organizations.name,
				slug: organizations.slug,
				logo: organizations.logo,
			})
			.from(organizations)
			.innerJoin(members, eq(members.organizationId, organizations.id))
			.where(eq(members.userId, ctx.session.user.id))
			.orderBy(organizations.name);
	}),

	listMembers: protectedProcedure
		.input(
			z.object({ includeDeactivated: z.boolean().default(false) }).nullish(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [eq(members.organizationId, organizationId)];
			if (!input?.includeDeactivated) {
				conditions.push(isNull(users.deletionRequestedAt));
			}
			return db
				.select({
					id: members.id,
					role: members.role,
					createdAt: members.createdAt,
					userId: members.userId,
					user: {
						id: users.id,
						name: users.name,
						email: users.email,
						image: users.image,
						deletionRequestedAt: users.deletionRequestedAt,
					},
				})
				.from(members)
				.innerJoin(users, eq(members.userId, users.id))
				.where(and(...conditions));
		}),

	listInvitations: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select({
				id: invitations.id,
				email: invitations.email,
				role: invitations.role,
				status: invitations.status,
				expiresAt: invitations.expiresAt,
				createdAt: invitations.createdAt,
				inviterId: invitations.inviterId,
				inviter: {
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
				},
			})
			.from(invitations)
			.innerJoin(users, eq(invitations.inviterId, users.id))
			.where(
				and(
					eq(invitations.organizationId, organizationId),
					eq(invitations.status, "pending"),
				),
			)
			.orderBy(desc(invitations.createdAt));
	}),

	listTeams: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const [teamRows, teamMemberRows] = await Promise.all([
			db
				.select({
					id: teams.id,
					name: teams.name,
					slug: teams.slug,
					createdAt: teams.createdAt,
				})
				.from(teams)
				.where(eq(teams.organizationId, organizationId))
				.orderBy(teams.name),
			db
				.select({
					id: teamMembers.id,
					teamId: teamMembers.teamId,
					userId: teamMembers.userId,
					createdAt: teamMembers.createdAt,
				})
				.from(teamMembers)
				.where(eq(teamMembers.organizationId, organizationId)),
		]);

		const membersByTeam = new Map<
			string,
			{ id: string; userId: string; createdAt: Date | null }[]
		>();
		for (const { teamId, ...member } of teamMemberRows) {
			const existing = membersByTeam.get(teamId);
			if (existing) {
				existing.push(member);
			} else {
				membersByTeam.set(teamId, [member]);
			}
		}

		return teamRows.map((team) => ({
			...team,
			members: membersByTeam.get(team.id) ?? [],
		}));
	}),

	getActive: protectedProcedure.query(async ({ ctx }) => {
		const orgId = ctx.activeOrganizationId;
		if (!orgId) return null;

		const membership = await db.query.members.findFirst({
			where: and(
				eq(members.userId, ctx.session.user.id),
				eq(members.organizationId, orgId),
			),
		});
		if (!membership) return null;

		const org = await db.query.organizations.findFirst({
			where: eq(organizations.id, orgId),
			columns: { id: true, name: true, slug: true },
		});
		return org ?? null;
	}),

	getActiveFromJwt: jwtProcedure.query(async ({ ctx }) => {
		if (!ctx.activeOrganizationId) return null;

		const membership = await db.query.members.findFirst({
			where: and(
				eq(members.userId, ctx.userId),
				eq(members.organizationId, ctx.activeOrganizationId),
			),
		});
		if (!membership) return null;

		const org = await db.query.organizations.findFirst({
			where: eq(organizations.id, ctx.activeOrganizationId),
			columns: { id: true, name: true, slug: true },
		});
		return org ?? null;
	}),

	getByIdFromJwt: jwtProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.id)) return null;

			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.userId, ctx.userId),
					eq(members.organizationId, input.id),
				),
			});
			if (!membership) return null;

			const org = await db.query.organizations.findFirst({
				where: eq(organizations.id, input.id),
				columns: { id: true, name: true, slug: true },
			});
			return org ?? null;
		}),

	getInvitation: protectedProcedure
		.input(z.uuid())
		.query(async ({ ctx, input }) => {
			const invitation = await getInvitationById(input);
			const isInvitee =
				ctx.session.user.email.toLowerCase() === invitation.email.toLowerCase();

			if (!isInvitee) {
				await verifyOrgAdmin(ctx.session.user.id, invitation.organizationId);
			}

			return {
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				status: invitation.status,
				expiresAt: invitation.expiresAt,
				isExpired: isInvitationExpired(invitation.expiresAt),
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

	getInvitationPreview: publicProcedure
		.input(
			z.object({
				invitationId: z.uuid(),
				token: z.string().min(1),
			}),
		)
		.query(async ({ input }) => {
			const invitation = await getInvitationById(input.invitationId);
			const verification = await db.query.verifications.findFirst({
				where: eq(verifications.value, input.token),
			});

			const hasValidToken =
				verification &&
				new Date() <= new Date(verification.expiresAt) &&
				verificationMatchesInvitation({
					verificationIdentifier: verification.identifier,
					invitationId: invitation.id,
					invitationEmail: invitation.email,
				});

			if (!hasValidToken) {
				throw userError({
					code: "NOT_FOUND",
					message: "Invitation not found",
					i18nKey: "serverError.organization.invitationNotFound",
				});
			}

			return {
				role: invitation.role,
				status: invitation.status,
				expiresAt: invitation.expiresAt,
				isExpired: isInvitationExpired(invitation.expiresAt),
				organization: {
					name: invitation.organization.name,
					logo: invitation.organization.logo,
				},
				inviter: {
					name: invitation.inviter.name,
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
			const domain = ctx.session.user.email.split("@")[1]?.toLowerCase();
			if (domain) {
				const domainOrg = await db.query.organizations.findFirst({
					where: sql`${organizations.allowedDomains} @> ARRAY[${domain}]::text[]`,
				});
				if (domainOrg) {
					throw userError({
						code: "FORBIDDEN",
						message:
							"Your account is managed by your organization. Contact your admin to create a new organization.",
						i18nKey: "serverError.organization.managedDomain",
					});
				}
			}

			const organization = await auth.api.createOrganization({
				body: {
					name: input.name,
					slug: input.slug,
					logo: input.logo,
					userId: ctx.session.user.id,
				},
			});

			if (!organization) {
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create organization",
					i18nKey: "serverError.organization.createFailed",
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

			const membership = await findOrgMembership({
				userId: ctx.session.user.id,
				organizationId: id,
			});

			if (!membership) {
				throw userError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
					i18nKey: "serverError.organization.youAreNotAMember",
				});
			}

			if (membership.role !== "owner") {
				throw userError({
					code: "FORBIDDEN",
					message: "Only owners can update organization settings",
					i18nKey:
						"serverError.organization.onlyOwnersCanUpdateOrganizationSettings",
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
					throw userError({
						code: "BAD_REQUEST",
						message: "This slug is already taken",
						i18nKey: "serverError.organization.slugTaken",
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
			const membership = await findOrgMembership({
				userId: ctx.session.user.id,
				organizationId: input.organizationId,
			});

			if (!membership) {
				throw userError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
					i18nKey: "serverError.organization.youAreNotAMember",
				});
			}

			if (membership.role !== "owner") {
				throw userError({
					code: "FORBIDDEN",
					message: "Only owners can update organization settings",
					i18nKey:
						"serverError.organization.onlyOwnersCanUpdateOrganizationSettings",
				});
			}

			const organization = await db.query.organizations.findFirst({
				where: eq(organizations.id, input.organizationId),
			});

			if (!organization) {
				throw userError({
					code: "NOT_FOUND",
					message: "Organization not found",
					i18nKey: "serverError.organization.organizationNotFound",
				});
			}

			const pathname = generateImagePathname({
				prefix: `organization/${input.organizationId}/logo`,
			});

			try {
				const url = await uploadImage({
					fileData: input.fileData,
					pathname,
					existingUrl: organization.logo,
				});

				const [updatedOrg] = await db
					.update(organizations)
					.set({ logo: url })
					.where(eq(organizations.id, input.organizationId))
					.returning();

				return { success: true, url, organization: updatedOrg };
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				console.error("[organization/uploadLogo] Upload failed:", error);
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to upload logo",
					i18nKey: "serverError.organization.failedToUploadLogo",
				});
			}
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			const member = await ctx.auth.api.addMember({
				body: {
					organizationId: input.organizationId,
					userId: input.userId,
					role: "member",
				},
				headers: ctx.headers,
			});
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
				throw userError({
					code: "NOT_FOUND",
					message: "Member not found",
					i18nKey: "serverError.organization.memberNotFound",
				});
			}

			const actorMembership = allMembers.find(
				(m) => m.userId === ctx.session.user.id,
			);
			if (!actorMembership) {
				throw userError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
					i18nKey: "serverError.organization.youAreNotAMember",
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
					throw userError({
						code: "FORBIDDEN",
						message: "Cannot remove yourself",
						i18nKey: "serverError.organization.cannotRemoveYourself",
					});
				}
				if (targetMember.role === "owner" && ownerCount === 1) {
					throw userError({
						code: "FORBIDDEN",
						message: "Cannot remove the last owner. Transfer ownership first.",
						i18nKey:
							"serverError.organization.cannotRemoveTheLastOwnerTransfer",
					});
				}
				throw userError({
					code: "FORBIDDEN",
					message: "You don't have permission to remove this member",
					i18nKey: "serverError.organization.youDonTHavePermission",
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
				throw userError({
					code: "NOT_FOUND",
					message: "You are not a member of this organization",
					i18nKey: "serverError.organization.youAreNotAMember",
				});
			}

			const leaveResult = await ctx.auth.api.leaveOrganization({
				body: { organizationId: input.organizationId },
				headers: ctx.headers,
			});

			if (!leaveResult) {
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to leave organization",
					i18nKey: "serverError.organization.failedToLeaveOrganization",
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
				throw userError({
					code: "NOT_FOUND",
					message: "Member not found",
					i18nKey: "serverError.organization.memberNotFound",
				});
			}

			const actorMembership = allMembers.find(
				(m) => m.userId === ctx.session.user.id,
			);
			if (!actorMembership) {
				throw userError({
					code: "FORBIDDEN",
					message: "You are not a member of this organization",
					i18nKey: "serverError.organization.youAreNotAMember",
				});
			}

			const actorRole = actorMembership.role as OrganizationRole;
			const targetRole = targetMember.role as OrganizationRole;
			const ownerCount = allMembers.filter((m) => m.role === "owner").length;

			if (actorRole === "admin" && targetRole === "owner") {
				throw userError({
					code: "FORBIDDEN",
					message: "Admins cannot modify owners",
					i18nKey: "serverError.organization.adminsCannotModifyOwners",
				});
			}

			if (actorRole === "admin" && input.role === "owner") {
				throw userError({
					code: "FORBIDDEN",
					message: "Admins cannot promote members to owner",
					i18nKey: "serverError.organization.adminsCannotPromoteMembersToOwner",
				});
			}

			if (actorRole === "member") {
				throw userError({
					code: "FORBIDDEN",
					message: "Members cannot modify roles",
					i18nKey: "serverError.organization.membersCannotModifyRoles",
				});
			}

			if (
				targetRole === "owner" &&
				ownerCount === 1 &&
				input.role !== "owner"
			) {
				throw userError({
					code: "FORBIDDEN",
					message: "Cannot demote the last owner. Promote someone else first.",
					i18nKey: "serverError.organization.cannotDemoteTheLastOwnerPromote",
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
