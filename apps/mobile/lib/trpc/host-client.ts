import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { authClient, getJwt, setJwt } from "../auth/client";
import { env } from "../env";
import type { HostChatClient } from "./host-chat-types";

export type HostClient = HostChatClient;

/**
 * Routing key the relay uses to identify a host-service tunnel:
 * `${organizationId}:${machineId}`. `v2Workspace.hostId` already stores the
 * host's machineId, so no join to v2_hosts is needed. Kept inline (rather than
 * importing `@superset/shared/host-routing`) so the RN bundle never pulls in
 * that package's node-only siblings — see packages/shared/src/host-routing.ts.
 */
export function buildHostRoutingKey(
	organizationId: string,
	machineId: string,
): string {
	return `${organizationId}:${machineId}`;
}

export function getHostRelayTrpcUrl(
	organizationId: string,
	hostId: string,
): string {
	const key = buildHostRoutingKey(organizationId, hostId);
	return `${env.EXPO_PUBLIC_RELAY_URL}/hosts/${key}/trpc`;
}

/**
 * A tRPC client bound to one workspace's host-service, reached over the relay
 * tunnel and authenticated with the user's JWT (the relay path accepts the same
 * JWT the app already manages). We type it against a local `HostChatClient`
 * facade rather than the server's `AppRouter` — an interim tradeoff, not a hard
 * constraint; see host-chat-types.ts for the verified reasoning.
 */
export function createHostClient(params: {
	organizationId: string;
	hostId: string;
}): HostChatClient {
	const url = getHostRelayTrpcUrl(params.organizationId, params.hostId);
	// biome-ignore lint/suspicious/noExplicitAny: proxy client is retyped to the local HostChatClient facade.
	const client = createTRPCProxyClient<any>({
		links: [
			httpBatchLink({
				url,
				async headers() {
					let jwt = getJwt();
					if (!jwt) {
						// Mirror the collections 401 path: mint a fresh JWT on demand.
						try {
							const result = await authClient.token();
							if (result.data?.token) {
								setJwt(result.data.token);
								jwt = result.data.token;
							}
						} catch {
							// fall through unauthenticated; the relay 401s and the query
							// surfaces the error to the UI.
						}
					}
					return jwt ? { Authorization: `Bearer ${jwt}` } : {};
				},
				transformer: superjson,
			}),
		],
	});
	return client as unknown as HostChatClient;
}
