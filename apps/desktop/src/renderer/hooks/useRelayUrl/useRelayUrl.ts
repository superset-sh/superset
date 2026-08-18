import { useQuery } from "@tanstack/react-query";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/**
 * Relay base URL for client-side WS opens (terminal, eventBus).
 *
 * Comes from the API so this client and the host-service it talks to always
 * agree: resolving it separately on each side let them land on different
 * relays, which surfaces as a host that looks permanently offline.
 */
export function useRelayUrl(): string {
	const { data } = useQuery({
		queryKey: ["relay-endpoint"],
		queryFn: () => apiTrpcClient.host.relayEndpoint.query(),
		staleTime: 5 * 60 * 1000,
		retry: 3,
	});
	return data?.url ?? env.RELAY_URL;
}
