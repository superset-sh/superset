import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQuery } from "@tanstack/react-query";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getJwt } from "renderer/lib/auth-client";

/**
 * When the relay last heard from an offline host, for the settings page's
 * "last seen" line. One read on demand, refreshed on focus; presence itself
 * comes from the host's event socket, never from here.
 */
export function useHostLastSeenAt(
	host: { organizationId: string; machineId: string } | undefined,
	enabled: boolean,
): number | null {
	const relayUrl = useRelayUrl();
	const routingKey = host
		? buildHostRoutingKey(host.organizationId, host.machineId)
		: null;
	const { data } = useQuery({
		queryKey: ["host-last-seen", relayUrl, routingKey],
		enabled: enabled && routingKey !== null,
		staleTime: 60_000,
		refetchOnWindowFocus: true,
		queryFn: async (): Promise<number | null> => {
			const jwt = getJwt();
			if (!jwt || !routingKey) return null;
			const response = await fetch(
				`${relayUrl}/presence?hostIds=${encodeURIComponent(routingKey)}`,
				{ headers: { authorization: `Bearer ${jwt}` } },
			);
			if (!response.ok) throw new Error(`presence fetch: ${response.status}`);
			const body = (await response.json()) as {
				hosts: Record<string, { lastSeenAt: number | null }>;
			};
			return body.hosts[routingKey]?.lastSeenAt ?? null;
		},
	});
	return data ?? null;
}
