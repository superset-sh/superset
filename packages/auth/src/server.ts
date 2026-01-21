import { expo } from "@better-auth/expo";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import type { sessions } from "@superset/db/schema/auth";
import * as authSchema from "@superset/db/schema/auth";
import { OrganizationInvitationEmail } from "@superset/email/emails/organization-invitation";
import { canInvite, type OrganizationRole } from "@superset/shared/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, customSession, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { env } from "./env";
import { acceptInvitationEndpoint } from "./lib/accept-invitation-endpoint";
import { generateMagicTokenForInvite } from "./lib/generate-magic-token";
import { invitationRateLimit } from "./lib/rate-limit";
import { resend } from "./lib/resend";

export const auth = betterAuth({
	baseURL: env.NEXT_PUBLIC_API_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema: authSchema,
	}),
	trustedOrigins: [
		env.NEXT_PUBLIC_WEB_URL,
		env.NEXT_PUBLIC_API_URL,
		env.NEXT_PUBLIC_MARKETING_URL,
		env.NEXT_PUBLIC_ADMIN_URL,
		// Electron desktop app origins
		...(env.NEXT_PUBLIC_DESKTOP_URL ? [env.NEXT_PUBLIC_DESKTOP_URL] : []), // Dev: http://localhost:5927
		"superset://app", // Production Electron app
		// React Native mobile app origins
		"superset://", // Production mobile app
		// Expo development mode - exp:// scheme with local IP ranges
		...(process.env.NODE_ENV === "development"
			? [
					"exp://", // Trust all Expo URLs (prefix matching)
					"exp://**", // Trust all Expo URLs (wildcard matching)
					"exp://192.168.*.*:*/**", // Trust 192.168.x.x IP range with any port and path
				]
			: []),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24, // refresh daily on activity
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5, // 5 minutes
		},
	},
	advanced: {
		crossSubDomainCookies: {
			enabled: true,
			domain: env.NEXT_PUBLIC_COOKIE_DOMAIN,
		},
		database: {
			generateId: false,
		},
	},
	socialProviders: {
		github: {
			clientId: env.GH_CLIENT_ID,
			clientSecret: env.GH_CLIENT_SECRET,
		},
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Create organization for new user
					const org = await auth.api.createOrganization({
						body: {
							name: `${user.name}'s Team`,
							slug: `${user.id.slice(0, 8)}-team`,
							userId: user.id,
						},
					});

					// Update all sessions for this user to set the active organization
					// This handles sessions created during signup before the org existed
					if (org?.id) {
						await db
							.update(authSchema.sessions)
							.set({ activeOrganizationId: org.id })
							.where(eq(authSchema.sessions.userId, user.id));
					}
				},
			},
		},
	},
	plugins: [
		expo(),
		organization({
			creatorRole: "owner",
			invitationExpiresIn: 60 * 60 * 24 * 7, // 1 week
			sendInvitationEmail: async (data) => {
				// Generate magic token for this invitation
				const token = await generateMagicTokenForInvite({
					email: data.email,
				});

				// Construct invitation link with magic token
				const inviteLink = `${env.NEXT_PUBLIC_WEB_URL}/accept-invitation/${data.id}?token=${token}`;

				// Check if user already exists to personalize greeting
				const existingUser = await db.query.users.findFirst({
					where: eq(authSchema.users.email, data.email),
				});

				await resend.emails.send({
					from: "Superset <noreply@superset.sh>",
					to: data.email,
					subject: `${data.inviter.user.name} invited you to join ${data.organization.name}`,
					react: OrganizationInvitationEmail({
						organizationName: data.organization.name,
						inviterName: data.inviter.user.name,
						inviteLink,
						role: data.role,
						inviteeName: existingUser?.name ?? null,
						inviterEmail: data.inviter.user.email,
						expiresAt: data.invitation.expiresAt,
					}),
				});
			},
			organizationHooks: {
				beforeCreateInvitation: async (data) => {
					const { inviterId, organizationId, role } = data.invitation;

					// Rate limiting: 10 invitations per hour per user
					const { success } = await invitationRateLimit.limit(inviterId);
					if (!success) {
						throw new Error(
							"Rate limit exceeded. Max 10 invitations per hour.",
						);
					}

					const inviterMember = await db.query.members.findFirst({
						where: and(
							eq(members.userId, inviterId),
							eq(members.organizationId, organizationId),
						),
					});

					if (!inviterMember) {
						throw new Error("Not a member of this organization");
					}

					if (
						!canInvite(
							inviterMember.role as OrganizationRole,
							role as OrganizationRole,
						)
					) {
						throw new Error("Cannot invite users with this role");
					}
				},
			},
		}),
		bearer(),
		customSession(async ({ user, session: baseSession }) => {
			const session = baseSession as typeof sessions.$inferSelect;

			let activeOrganizationId = session.activeOrganizationId;

			const membership = await db.query.members.findFirst({
				where: activeOrganizationId
					? and(
							eq(members.userId, session.userId),
							eq(members.organizationId, activeOrganizationId),
						)
					: eq(members.userId, session.userId),
			});

			if (!activeOrganizationId && membership?.organizationId) {
				activeOrganizationId = membership.organizationId;
				await db
					.update(authSchema.sessions)
					.set({ activeOrganizationId })
					.where(eq(authSchema.sessions.id, session.id));
			}

			return {
				user,
				session: { ...session, activeOrganizationId, role: membership?.role },
			};
		}),
		acceptInvitationEndpoint,
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
