import type {
	ChatTransport,
	SessionClient,
	StreamSocket,
} from "@superset/chat/client";
import { createSessionClient } from "@superset/chat/client";
import type { ChatRouter } from "@superset/chat-runtime";
import { createTRPCClient, httpLink } from "@trpc/client";
import { randomUUID } from "expo-crypto";
import { getJwt } from "../auth/client";
import { transportRetryLink } from "../errors";
import { getHostAuthToken } from "../host/client";
import {
	ensureSandboxAccess,
	isSandboxHost,
	sandboxToken,
} from "../sandbox-access";

// Hermes has no crypto.randomUUID, and the chat outbox mints prompt ids with it.
const scope = globalThis as { crypto?: { randomUUID?: () => string } };
scope.crypto ??= {};
scope.crypto.randomUUID ??= randomUUID;

export interface ChatHost {
	organizationId: string;
	machineId: string;
}

const transportCache = new Map<string, ChatTransport>();

export function getChatTransport(hostUrl: string): ChatTransport {
	const cached = transportCache.get(hostUrl);
	if (cached) return cached;

	const client = createTRPCClient<ChatRouter>({
		links: [
			transportRetryLink(),
			httpLink({
				url: `${hostUrl}/chat-v3/trpc`,
				headers: () => {
					const bearer = sandboxToken(hostUrl) ?? getJwt();
					return bearer ? { Authorization: `Bearer ${bearer}` } : {};
				},
			}),
		],
	});
	const transport: ChatTransport = {
		createSession: (input) => client.createSession.mutate(input),
		prompt: (input) => client.prompt.mutate(input),
		removeQueuedPrompt: (input) => client.removeQueuedPrompt.mutate(input),
		steerQueuedPrompt: (input) => client.steerQueuedPrompt.mutate(input),
		resumeQueue: (input) => client.resumeQueue.mutate(input),
		cancelTurn: (input) => client.cancelTurn.mutate(input),
		respondToApproval: (input) => client.respondToApproval.mutate(input),
		setMode: (input) => client.setMode.mutate(input),
		setConfigOption: (input) => client.setConfigOption.mutate(input),
		closeSession: (input) => client.closeSession.mutate(input),
		forkSession: (input) => client.forkSession.mutate(input),
		getSession: (input) => client.getSession.query(input),
		getQueue: (input) => client.getQueue.query(input),
		listSessions: (input) => client.listSessions.query(input),
		getItems: (input) => client.getItems.query(input),
	};
	transportCache.set(hostUrl, transport);
	return transport;
}

async function signedStreamUrl(host: ChatHost, url: string): Promise<string> {
	const token = isSandboxHost(host.machineId)
		? (await ensureSandboxAccess(host.machineId)).token
		: await getHostAuthToken();
	const separator = url.includes("?") ? "&" : "?";
	return `${url.replace(/^http/, "ws")}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * The shared client dials synchronously, but a relay JWT or a sandbox grant
 * is minted asynchronously and must be fresh on every redial. This socket
 * stands in until the signed URL exists, then forwards to the real one.
 */
function createDeferredSocket(host: ChatHost, url: string): StreamSocket {
	let inner: WebSocket | null = null;
	let closed = false;
	const socket: StreamSocket = {
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
		close() {
			closed = true;
			inner?.close();
		},
	};
	const emit = (handler: StreamSocket["onopen"], event?: { data: unknown }) =>
		(handler as ((event?: { data: unknown }) => void) | null)?.(event);

	signedStreamUrl(host, url).then(
		(signed) => {
			if (closed) return;
			const ws = new WebSocket(signed);
			inner = ws;
			ws.onopen = () => emit(socket.onopen);
			ws.onmessage = (event) => emit(socket.onmessage, { data: event.data });
			ws.onerror = () => emit(socket.onerror);
			ws.onclose = () => emit(socket.onclose);
		},
		() => {
			if (!closed) emit(socket.onclose);
		},
	);
	return socket;
}

export function createChatSessionClient(options: {
	sessionId: string;
	host: ChatHost;
	hostUrl: string;
}): SessionClient {
	return createSessionClient({
		sessionId: options.sessionId,
		transport: getChatTransport(options.hostUrl),
		streamBaseUrl: `${options.hostUrl}/chat-v3`,
		createSocket: (url) => createDeferredSocket(options.host, url),
		mintId: randomUUID,
	});
}
