import { apiKeyClient } from "@better-auth/api-key/client";
import { stripeClient } from "@better-auth/stripe/client";
import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	jwtClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "renderer/env.renderer";
import { decodeJwtExpiresAtMs } from "renderer/lib/jwt-expiry";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

let jwt: string | null = null;
let jwtExpiresAtMs: number | null = null;
let jwtGeneration = 0;
let jwtRefreshInFlight: Promise<string | null> | null = null;

// Refresh ahead of expiry so a token handed to a WS URL is still valid by the
// time the relay verifies it.
const JWT_REFRESH_LEEWAY_MS = 60_000;

export function setJwt(token: string | null) {
	jwt = token;
	jwtGeneration++;
	jwtExpiresAtMs = token ? decodeJwtExpiresAtMs(token) : null;
}

function jwtIsFresh(): boolean {
	if (!jwt) return false;
	if (jwtExpiresAtMs === null) return true;
	return Date.now() < jwtExpiresAtMs - JWT_REFRESH_LEEWAY_MS;
}

export function getJwt(): string | null {
	// Relay JWTs rotate hourly, but this cache only updates when some API
	// response happens to carry `set-auth-jwt`. Sync callers (WS URL builders,
	// reconnect loops) can't await a refresh, so kick one off in the background
	// and let their next attempt pick up the fresh token.
	if (jwt && !jwtIsFresh()) void ensureFreshJwt();
	return jwt;
}

/**
 * Returns the cached JWT if it's still valid, otherwise mints a fresh one from
 * better-auth's `/token` endpoint (deduped across concurrent callers). Falls
 * back to the stale cached token if the refresh fails.
 */
export async function ensureFreshJwt(): Promise<string | null> {
	if (jwtIsFresh()) return jwt;
	if (!jwtRefreshInFlight) {
		const generationAtStart = jwtGeneration;
		jwtRefreshInFlight = authClient
			.$fetch<{ token?: string }>("/token")
			.then((res) => {
				const token = res.data?.token;
				// Apply only if nothing (logout, a set-auth-jwt response header)
				// replaced the cached token while this request was in flight.
				if (
					typeof token === "string" &&
					token &&
					jwtGeneration === generationAtStart
				) {
					setJwt(token);
				}
				return jwt;
			})
			.catch((err) => {
				console.warn("[auth] JWT refresh failed:", err);
				return jwt;
			})
			.finally(() => {
				jwtRefreshInFlight = null;
			});
	}
	return jwtRefreshInFlight;
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
		organizationClient({
			teams: { enabled: true },
			schema: {
				team: {
					additionalFields: {
						slug: { type: "string", input: true, required: true },
					},
				},
			},
		}),
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
