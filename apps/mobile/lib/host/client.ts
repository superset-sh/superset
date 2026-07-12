import {
	type AcpHostClient,
	createAcpHostClient,
	createHostTransport,
} from "@superset/host-client";
import type {
	AcpSessionsApi,
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import { authClient, getJwt, setJwt } from "@/lib/auth/client";
import { env } from "@/lib/env";

// Mobile binding of @superset/host-client: this file only supplies the relay
// URL from Expo env and the JWT from the auth client — transport mechanics
// (SuperJSON, 401-retry, WS token minting) live in the shared package.

export function getRelayUrl(): string {
	const url = env.EXPO_PUBLIC_RELAY_URL;
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

let acp: AcpHostClient | null = null;

function getAcpClient(): AcpHostClient {
	acp ??= createAcpHostClient(
		createHostTransport({ getRelayUrl, getToken: getHostAuthToken }),
	);
	return acp;
}

export function listAcpSessions(
	routingKey: string,
	workspaceId: string,
): Promise<SessionsPage> {
	return getAcpClient().listSessions(routingKey, workspaceId);
}

export function createAcpSession(
	routingKey: string,
	input: { sessionId: string; workspaceId: string },
): Promise<SessionScopedState> {
	return getAcpClient().createSession(routingKey, input);
}

export function createAcpSessionsApi(routingKey: string): AcpSessionsApi {
	return getAcpClient().sessionsApi(routingKey);
}

/** WS endpoint factory for the live update stream. */
export function createAcpStreamUrl(options: {
	routingKey: string;
	sessionId: string;
}): () => Promise<string> {
	return getAcpClient().streamUrl(options);
}
