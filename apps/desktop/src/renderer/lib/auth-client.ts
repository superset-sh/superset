import { stripeClient } from "@better-auth/stripe/client";
import type { auth } from "@superset/auth/server";
import {
	apiKeyClient,
	customSessionClient,
	jwtClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "renderer/env.renderer";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

let jwt: string | null = null;

export function setJwt(token: string | null) {
	jwt = token;
}

export function getJwt(): string | null {
	return jwt;
}

/**
 * Better Auth client for Electron desktop app.
 *
 * Bearer authentication configured via onRequest hook.
 * Server has bearer() plugin enabled to accept bearer tokens.
 */
export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_API_URL,
	plugins: [
		organizationClient(),
		customSessionClient<typeof auth>(),
		stripeClient({ subscription: true }),
		apiKeyClient(),
		jwtClient(),
	],
	fetchOptions: {
		credentials: "include",
		onRequest: async (context) => {
			const token = getAuthToken();
			if (token) {
				context.headers.set("Authorization", `Bearer ${token}`);
			}
		},
		onResponse: async (context) => {
			const token = context.response.headers.get("set-auth-jwt");
			if (token) {
				setJwt(token);
			}
		},
	},
});
