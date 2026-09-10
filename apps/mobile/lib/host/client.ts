import { authClient, getJwt, setJwt } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { apiClient } from "@/lib/trpc/client";

// Mobile relay access: this file only supplies the relay URL and a
// fresh-enough JWT from the auth client. Typed host tRPC clients live in
// lib/host-service/client.

// The API decides which relay this user's host is on. Primed once after
// sign-in and cached; the Expo env is the fallback until then and if the API
// is unreachable. Sync getter so the URL builders that depend on it stay sync.
let relayOverride: string | null = null;

export async function primeRelayUrl(): Promise<void> {
	try {
		const endpoint = await apiClient.host.relayEndpoint.query();
		if (endpoint?.url) relayOverride = endpoint.url.replace(/\/$/, "");
	} catch {
		// Keep the env fallback.
	}
}

export function getRelayUrl(): string {
	const url = relayOverride ?? env.EXPO_PUBLIC_RELAY_URL;
	if (!url) {
		throw new Error(
			"EXPO_PUBLIC_RELAY_URL is not set — live sessions need the relay. " +
				"Add it to your environment and restart `expo start`.",
		);
	}
	return url.replace(/\/$/, "");
}

export async function getHostAuthToken(options?: {
	forceRefresh?: boolean;
}): Promise<string> {
	if (!options?.forceRefresh) {
		const cached = getJwt();
		if (cached && !expiresSoon(cached)) return cached;
	}
	const result = await authClient.token();
	const token = result.data?.token;
	if (!token) {
		throw new Error("Not signed in: no JWT available for host access");
	}
	setJwt(token);
	return token;
}

/**
 * True when the JWT's exp claim is within a minute of now. Unreadable tokens
 * count as fresh — the 401-retry (HTTP) / reconnect (WS) paths still recover.
 */
function expiresSoon(token: string): boolean {
	try {
		const payload = token.split(".")[1] ?? "";
		const decoded = JSON.parse(
			atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
		) as { exp?: number };
		if (typeof decoded.exp !== "number") return false;
		return decoded.exp * 1000 - Date.now() < 60_000;
	} catch {
		return false;
	}
}
