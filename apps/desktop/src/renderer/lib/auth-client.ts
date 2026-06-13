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

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

let jwt: string | null = null;
let jwtExpiresAtMs: number | null = null;
let jwtRefreshInFlight: Promise<string | null> | null = null;

const JWT_REFRESH_SKEW_MS = 5 * 60 * 1000;

function decodeJwtExpirationMs(token: string): number | null {
	const [, payload] = token.split(".");
	if (!payload) return null;

	try {
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(
			normalized.length + ((4 - (normalized.length % 4)) % 4),
			"=",
		);
		const json = globalThis.atob(padded);
		const parsed = JSON.parse(json) as { exp?: unknown };
		return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
	} catch {
		return null;
	}
}

export function setJwt(token: string | null) {
	jwt = token;
	jwtExpiresAtMs = token ? decodeJwtExpirationMs(token) : null;
}

export function getJwt(): string | null {
	return jwt;
}

export function isJwtExpiringSoon(skewMs = JWT_REFRESH_SKEW_MS): boolean {
	if (!jwt) return true;
	if (!jwtExpiresAtMs) return true;
	return jwtExpiresAtMs <= Date.now() + skewMs;
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

export async function refreshJwt(): Promise<string | null> {
	if (jwtRefreshInFlight) return jwtRefreshInFlight;

	jwtRefreshInFlight = authClient
		.token()
		.then((res) => {
			const token = res.data?.token ?? null;
			if (token) setJwt(token);
			return token;
		})
		.catch((error) => {
			console.warn("[auth] JWT refresh failed", error);
			return null;
		})
		.finally(() => {
			jwtRefreshInFlight = null;
		});

	return jwtRefreshInFlight;
}

export async function ensureFreshJwt(
	skewMs = JWT_REFRESH_SKEW_MS,
): Promise<string | null> {
	if (!isJwtExpiringSoon(skewMs)) return jwt;
	return refreshJwt();
}
