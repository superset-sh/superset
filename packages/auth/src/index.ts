import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";

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
					await auth.api.createOrganization({
						body: {
							name: `${user.name}'s Workspace`,
							slug: `${user.id.slice(0, 8)}-workspace`,
							userId: user.id,
						},
					});
				},
			},
		},
		session: {
			create: {
				before: async (session) => {
					// Set initial active organization when session is created
					const membership = await db.query.members.findFirst({
						where: eq(members.userId, session.userId),
					});

					return {
						data: {
							...session,
							activeOrganizationId: membership?.organizationId,
						},
					};
				},
			},
		},
	},
	plugins: [
		organization({
			creatorRole: "owner",
		}),
		bearer(),
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
