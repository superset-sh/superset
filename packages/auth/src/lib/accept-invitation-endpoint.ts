import { db } from "@superset/db/client";
import {
	invitations,
	members,
	users,
	verifications,
} from "@superset/db/schema/auth";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const acceptInvitationEndpoint = {
	id: "accept-invitation",
	endpoints: {
		acceptInvitation: createAuthEndpoint(
			"/accept-invitation",
			{
				method: "POST",
				body: z.object({
					invitationId: z.string().uuid(),
					token: z.string(),
				}),
			},
			async (ctx) => {
				const { invitationId, token } = ctx.body;

				console.log(
					"[invitation/accept] START - invitationId:",
					invitationId,
					"token:",
					token.substring(0, 8) + "...",
				);

				// 1. Verify token exists and is valid
				const verification = await db.query.verifications.findFirst({
					where: eq(verifications.value, token),
				});

				if (!verification || new Date() > new Date(verification.expiresAt)) {
					console.log("[invitation/accept] ERROR - Invalid or expired token");
					throw new Error("Invalid or expired token");
				}

				console.log(
					"[invitation/accept] Token verified for email:",
					verification.identifier,
				);

				// 2. Get invitation to verify email matches
				const invitation = await db.query.invitations.findFirst({
					where: eq(invitations.id, invitationId),
					with: {
						organization: true,
					},
				});

				if (!invitation) {
					console.log("[invitation/accept] ERROR - Invitation not found");
					throw new Error("Invitation not found");
				}

				if (invitation.email !== verification.identifier) {
					console.log(
						"[invitation/accept] ERROR - Token email does not match invitation email",
					);
					throw new Error("Token does not match invitation");
				}

				if (invitation.status !== "pending") {
					console.log(
						"[invitation/accept] ERROR - Invitation already processed:",
						invitation.status,
					);
					throw new Error("Invitation already accepted or rejected");
				}

				console.log("[invitation/accept] Invitation validated");

				// 3. Create or get user
				let user = await db.query.users.findFirst({
					where: eq(users.email, invitation.email),
				});

				if (!user) {
					console.log("[invitation/accept] Creating new user");
					const userName =
						invitation.name || invitation.email.split("@")[0] || "User";
					const [newUser] = await db
						.insert(users)
						.values({
							email: invitation.email,
							name: userName,
							emailVerified: true, // Email verified via magic link
						})
						.returning();

					if (!newUser) {
						throw new Error("Failed to create user");
					}

					user = newUser;
					console.log("[invitation/accept] New user created:", user.id);
				} else {
					console.log("[invitation/accept] Existing user found:", user.id);
				}

				// 4. Create session using Better Auth's proper API
				console.log("[invitation/accept] Creating session for user:", user.id);

				const session = await ctx.context.internalAdapter.createSession(
					user.id,
				);

				if (!session) {
					throw new Error("Failed to create session");
				}

				// Update session with active organization
				await ctx.context.internalAdapter.updateSession(session.token, {
					activeOrganizationId: invitation.organization.id,
				});

				console.log("[invitation/accept] Session created:", session.token);

				// 5. Accept invitation by updating status and creating member
				console.log("[invitation/accept] Accepting invitation");

				await db
					.update(invitations)
					.set({ status: "accepted" })
					.where(eq(invitations.id, invitationId));

				console.log(
					"[invitation/accept] Invitation status updated to accepted",
				);

				// Create member record (check if not already a member)
				const existingMember = await db.query.members.findFirst({
					where: and(
						eq(members.organizationId, invitation.organization.id),
						eq(members.userId, user.id),
					),
				});

				if (!existingMember) {
					await db.insert(members).values({
						organizationId: invitation.organization.id,
						userId: user.id,
						role: invitation.role ?? "member",
					});

					console.log(
						"[invitation/accept] Member created for organization:",
						invitation.organization.id,
					);
				} else {
					console.log(
						"[invitation/accept] User already a member, skipping member creation",
					);
				}

				// 6. Delete verification token (one-time use)
				await db.delete(verifications).where(eq(verifications.value, token));
				console.log("[invitation/accept] Verification token deleted");

				console.log("[invitation/accept] COMPLETE - Success");

				// 7. Return the session to set cookie on the client
				return ctx.json(
					{
						success: true,
						organizationId: invitation.organization.id,
						session,
						user,
					},
					{
						body: {
							session,
							user,
						},
					},
				);
			},
		),
	},
} satisfies BetterAuthPlugin;
