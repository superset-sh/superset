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

				console.log("[invitation/accept] START - invitationId:", invitationId);

				// 1. Verify token exists and is valid
				const verification = await db.query.verifications.findFirst({
					where: eq(verifications.value, token),
				});

				if (!verification || new Date() > new Date(verification.expiresAt)) {
					console.log("[invitation/accept] ERROR - Invalid or expired token");
					throw new Error("Invalid or expired token");
				}

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

				// 3. Create or get user
				let user = await db.query.users.findFirst({
					where: eq(users.email, invitation.email),
				});

				if (!user) {
					const userName = invitation.email;
					const [newUser] = await db
						.insert(users)
						.values({
							email: invitation.email,
							name: userName,
							emailVerified: true,
						})
						.returning();

					if (!newUser) {
						throw new Error("Failed to create user");
					}

					user = newUser;
				}

				// 4. Create session using Better Auth's proper API
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

				// Set session cookie (follows Better Auth's setSessionCookie pattern)
				await ctx.setSignedCookie(
					ctx.context.authCookies.sessionToken.name,
					session.token,
					ctx.context.secret,
					{
						...ctx.context.authCookies.sessionToken.attributes,
						maxAge: ctx.context.sessionConfig.expiresIn,
					},
				);

				ctx.context.setNewSession({
					session: session,
					user: user,
				});

				// 5. Accept invitation by updating status and creating member
				await db
					.update(invitations)
					.set({ status: "accepted" })
					.where(eq(invitations.id, invitationId));

				// Create member record (check if not already a member)
				const existingMember = await db.query.members.findFirst({
					where: and(
						eq(members.organizationId, invitation.organization.id),
						eq(members.userId, user.id),
					),
				});

				if (!existingMember) {
					// Dynamic import: this plugin needs to call the organization plugin's
					// addMember API to trigger billing hooks (beforeAddMember/afterAddMember).
					// server.ts imports this file as a plugin, so a static import would be circular.
					// The import resolves at request time when all modules are fully initialized.
					const { auth } = await import("../server");
					await auth.api.addMember({
						body: {
							organizationId: invitation.organization.id,
							userId: user.id,
							role:
								(invitation.role as "member" | "owner" | "admin") ?? "member",
						},
					});
				}

				// 6. Delete verification token (one-time use)
				await db.delete(verifications).where(eq(verifications.value, token));

				console.log("[invitation/accept] COMPLETE - Success");

				// 7. Return success (session is now in the cookie)
				return ctx.json({
					success: true,
					organizationId: invitation.organization.id,
				});
			},
		),
	},
} satisfies BetterAuthPlugin;
