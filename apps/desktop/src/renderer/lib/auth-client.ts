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
let authTokenExpiresAtMs: number | null = null;

function parseAuthTokenExpiresAtMs(expiresAt: string | null): number | null {
	if (!expiresAt) {
		return null;
	}

	const parsedExpiresAtMs = new Date(expiresAt).getTime();
	return Number.isFinite(parsedExpiresAtMs) ? parsedExpiresAtMs : 0;
}

export function clearAuthTokenState() {
	authToken = null;
	authTokenExpiresAtMs = null;
}

function isAuthTokenExpired(): boolean {
	return authTokenExpiresAtMs !== null && authTokenExpiresAtMs <= Date.now();
}

export function clearAuthState() {
	clearAuthTokenState();
	jwt = null;
}

export function setAuthToken(
	token: string | null,
	expiresAt: string | null = null,
) {
	if (!token) {
		clearAuthTokenState();
		return;
	}

	authToken = token;
	authTokenExpiresAtMs = parseAuthTokenExpiresAtMs(expiresAt);
	if (isAuthTokenExpired()) {
		clearAuthState();
	}
}

export function getAuthToken(): string | null {
	if (isAuthTokenExpired()) {
		clearAuthState();
		return null;
	}
	return authToken;
}

export function hasAuthToken(): boolean {
	return getAuthToken() !== null;
}

export function getAuthTokenExpiresAtMs(): number | null {
	if (!getAuthToken()) {
		return null;
	}
	return authTokenExpiresAtMs;
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
