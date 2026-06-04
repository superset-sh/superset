import { db, dbWs } from "@superset/db/client";
import {
	invitations,
	members,
	users,
	verifications,
} from "@superset/db/schema/auth";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

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

function getInvitationAcceptError(error: unknown) {
	if (!(error instanceof Error)) {
		return {
			error: "Failed to accept invitation.",
			status: 500,
		};
	}

	if (
		error.message ===
		"Free plan is limited to 1 user. Upgrade to add more members."
	) {
		return {
			error: error.message,
			status: 409,
		};
	}

	return {
		error: "Failed to accept invitation.",
		status: 500,
	};
}

function getProcessedInvitationError(status: string) {
	return {
		error:
			status === "accepted"
				? "This invitation has already been accepted."
				: "This invitation is no longer available.",
		status: 409,
	};
}

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
					return ctx.json(
						{ error: "This invitation link is invalid or has expired." },
						{ status: 400 },
					);
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
					return ctx.json(
						{ error: "This invitation link is invalid or has expired." },
						{ status: 404 },
					);
				}

				if (
					!verificationMatchesInvitation({
						verificationIdentifier: verification.identifier,
						invitationId: invitation.id,
						invitationEmail: invitation.email,
					})
				) {
					console.log(
						"[invitation/accept] ERROR - Token does not match invitation",
					);
					return ctx.json(
						{ error: "This invitation link is invalid or has expired." },
						{ status: 400 },
					);
				}

				if (invitation.status !== "pending") {
					const processedError = getProcessedInvitationError(invitation.status);
					console.log(
						"[invitation/accept] ERROR - Invitation already processed:",
						invitation.status,
					);
					return ctx.json({ error: processedError.error }, { status: 409 });
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

				// 4. Hold the invitation row lock while membership is finalized so the
				// invite cannot be observed as accepted before member creation succeeds.
				const acceptanceResult = await dbWs.transaction(async (tx) => {
					const lockedInvitation = await tx.execute<{ status: string }>(
						sql`select ${invitations.status} as status from ${invitations} where ${invitations.id} = ${invitationId} for update`,
					);
					const lockedInvitationStatus = lockedInvitation.rows[0]?.status;

					if (!lockedInvitationStatus) {
						return {
							ok: false as const,
							error: "This invitation link is invalid or has expired.",
							status: 404,
						};
					}

					if (lockedInvitationStatus !== "pending") {
						const processedError = getProcessedInvitationError(
							lockedInvitationStatus,
						);
						return {
							ok: false as const,
							error: processedError.error,
							status: processedError.status,
						};
					}

					const existingMember = await tx.query.members.findFirst({
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
						try {
							const { auth } = await import("../server");
							await auth.api.addMember({
								body: {
									organizationId: invitation.organization.id,
									userId: user.id,
									role:
										(invitation.role as "member" | "owner" | "admin") ??
										"member",
								},
							});
						} catch (error) {
							const memberAfterError = await tx.query.members.findFirst({
								where: and(
									eq(members.organizationId, invitation.organization.id),
									eq(members.userId, user.id),
								),
							});

							if (!memberAfterError) {
								const acceptError = getInvitationAcceptError(error);
								console.log(
									"[invitation/accept] ERROR - Failed to add member:",
									error,
								);
								return {
									ok: false as const,
									error: acceptError.error,
									status: acceptError.status,
								};
							}

							console.warn(
								"[invitation/accept] addMember threw after member creation; continuing",
								error,
							);
						}
					}

					await tx
						.update(invitations)
						.set({ status: "accepted" })
						.where(eq(invitations.id, invitationId));

					return { ok: true as const };
				});

				if (!acceptanceResult.ok) {
					return ctx.json(
						{ error: acceptanceResult.error },
						{ status: acceptanceResult.status },
					);
				}

				// 5. Create session using Better Auth's proper API
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
