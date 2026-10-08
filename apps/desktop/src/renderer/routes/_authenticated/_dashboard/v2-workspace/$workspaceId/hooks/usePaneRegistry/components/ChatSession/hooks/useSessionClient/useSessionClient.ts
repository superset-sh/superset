import type {
	ChatTransport,
	SessionClient,
	StreamSocket,
} from "@superset/chat/client";
import {
	chatTransportFromTrpc,
	createSessionClient,
} from "@superset/chat/client";
import type { ChatRouter } from "@superset/chat-runtime";
import { useWorkspaceClient } from "@superset/workspace-client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { useEffect, useMemo } from "react";
import { getHostServiceHeaders } from "renderer/lib/host-service-auth";

export type ChatWiring = {
	transport: ChatTransport;
	streamBaseUrl: string;
	createSocket: (url: string) => StreamSocket;
};

export function useChatWiring(): ChatWiring {
	const { getWsToken, hostUrl } = useWorkspaceClient();

	return useMemo(() => {
		const client = createTRPCClient<ChatRouter>({
			links: [
				httpBatchLink({
					url: `${hostUrl}/chat-v3/trpc`,
					headers: () => getHostServiceHeaders(hostUrl),
				}),
			],
		});
		const transport = chatTransportFromTrpc(client);
		const createSocket = (url: string): StreamSocket => {
			const wsUrl = new URL(url);
			wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
			const token = getWsToken();
			if (token) wsUrl.searchParams.set("token", token);
			return new WebSocket(wsUrl.toString());
		};
		return { transport, streamBaseUrl: `${hostUrl}/chat-v3`, createSocket };
	}, [hostUrl, getWsToken]);
}

export function useSessionClient(sessionId: string | null): {
	client: SessionClient | null;
	wiring: ChatWiring;
} {
	const wiring = useChatWiring();
	const client = useMemo(
		() =>
			sessionId
				? createSessionClient({
						sessionId,
						transport: wiring.transport,
						streamBaseUrl: wiring.streamBaseUrl,
						createSocket: wiring.createSocket,
					})
				: null,
		[sessionId, wiring],
	);

	useEffect(() => {
		return () => {
			client?.close();
		};
	}, [client]);

	return { client, wiring };
}
