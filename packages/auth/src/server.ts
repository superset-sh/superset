import { expo } from "@better-auth/expo";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import type { sessions } from "@superset/db/schema/auth";
import * as authSchema from "@superset/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, customSession, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";

import { env } from "./env";

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
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
