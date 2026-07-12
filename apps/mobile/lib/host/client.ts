import {
	createHostTransport,
	createSessionsHostClient,
	type SessionsHostClient,
} from "@superset/host-client";
import {
	createSessionsSyncClient,
	type SessionsSyncClient,
	type WebSocketLike,
} from "@superset/host-service-sync/client";
import type {
	CancelTurnReceipt,
	ContentBlock,
	CreateSessionResult,
	HostSnapshot,
	PermissionOutcome,
	ResolvePermissionReceipt,
	SubmitTurnReceipt,
	UpdateSessionReceipt,
} from "@superset/host-service-sync/protocol";
import * as Crypto from "expo-crypto";
import { authClient, getJwt, setJwt } from "@/lib/auth/client";
import { env } from "@/lib/env";

// Mobile binding of @superset/host-client's canonical sessions surface: this
// file only supplies the relay URL from Expo env and the JWT from the auth
// client — transport mechanics (SuperJSON, 401-retry, WS token minting) live
// in the shared package, and the read plane is a per-host
// createSessionsSyncClient over `/sessions/sync`.

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

let sessionsClient: SessionsHostClient | null = null;

function getSessionsClient(): SessionsHostClient {
	sessionsClient ??= createSessionsHostClient(
		createHostTransport({ getRelayUrl, getToken: getHostAuthToken }),
	);
	return sessionsClient;
}

/**
 * The relay's WS proxy does not negotiate subprotocols, so unlike the
 * package default this factory opens the socket without requesting one —
 * the host's `/sessions/sync` route accepts either.
 */
function createRelayWebSocket(url: string): WebSocketLike {
	const nativeSocket = new WebSocket(url);
	const adapter: WebSocketLike = {
		get readyState() {
			return nativeSocket.readyState;
		},
		get bufferedAmount() {
			return nativeSocket.bufferedAmount;
		},
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
		send(data) {
			nativeSocket.send(data);
		},
		close(code, reason) {
			nativeSocket.close(code, reason);
		},
	};
	nativeSocket.onopen = () => adapter.onopen?.();
	nativeSocket.onmessage = (event) => adapter.onmessage?.({ data: event.data });
	nativeSocket.onclose = (event) =>
		adapter.onclose?.({
			code: event.code,
			reason: event.reason,
			wasClean: event.wasClean,
		});
	nativeSocket.onerror = (event) => adapter.onerror?.(event);
	return adapter;
}

const clientInstanceId = Crypto.randomUUID();
const syncClients = new Map<string, SessionsSyncClient>();

/**
 * One long-lived sync client per host, connected on first use. Screens
 * subscribe/release sessions through it (useRetainSession); the socket and
 * host stream stay up for the app's lifetime so the home list stays fresh.
 */
export function getHostSyncClient(routingKey: string): SessionsSyncClient {
	let client = syncClients.get(routingKey);
	if (!client) {
		const sessions = getSessionsClient();
		client = createSessionsSyncClient({
			clientInstanceId,
			clientVersion: "mobile",
			syncUrl: sessions.syncUrl(routingKey),
			api: sessions.syncApi(routingKey),
			createWebSocket: (url) => createRelayWebSocket(url),
		});
		client.connect();
		syncClients.set(routingKey, client);
	}
	return client;
}

function mintRequestId(): string {
	return Crypto.randomUUID();
}

export function listSessions(routingKey: string): Promise<HostSnapshot> {
	return getSessionsClient().list(routingKey);
}

export function createSession(
	routingKey: string,
	input: { workspaceId: string; activeModel?: string | null },
): Promise<CreateSessionResult> {
	return getSessionsClient().create(routingKey, {
		requestId: mintRequestId(),
		workspaceId: input.workspaceId,
		agentId: "claude-code",
		title: null,
		settings: {
			activeModel: input.activeModel ?? null,
			activeMode: null,
			effort: null,
			configuration: {},
		},
	});
}

export function updateSession(
	routingKey: string,
	input: {
		sessionId: string;
		title?: string | null;
		archived?: boolean;
		settings?: { activeModel?: string; activeMode?: string; effort?: string };
	},
): Promise<UpdateSessionReceipt> {
	return getSessionsClient().update(routingKey, {
		requestId: mintRequestId(),
		...input,
	});
}

export function submitTurn(
	routingKey: string,
	input: { sessionId: string; threadId: string; content: ContentBlock[] },
): Promise<SubmitTurnReceipt> {
	return getSessionsClient().submitTurn(routingKey, {
		requestId: mintRequestId(),
		...input,
	});
}

export function cancelTurn(
	routingKey: string,
	input: { sessionId: string; turnId: string },
): Promise<CancelTurnReceipt> {
	return getSessionsClient().cancelTurn(routingKey, {
		requestId: mintRequestId(),
		...input,
	});
}

export function resolvePermission(
	routingKey: string,
	input: {
		sessionId: string;
		permissionId: string;
		outcome: PermissionOutcome;
	},
): Promise<ResolvePermissionReceipt> {
	return getSessionsClient().resolvePermission(routingKey, {
		requestId: mintRequestId(),
		...input,
	});
}
