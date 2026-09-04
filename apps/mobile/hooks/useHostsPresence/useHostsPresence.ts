import {
	buildHostRoutingKey,
	parseHostRoutingKey,
} from "@superset/shared/host-routing";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	getHostAuthToken,
	getRelayUrl,
	primeRelayUrl,
} from "@/lib/host/client";

export interface HostPresenceTarget {
	organizationId: string;
	machineId: string;
}

const PRESENCE_BATCH_LIMIT = 50;

interface PresenceResponse {
	hosts: Record<string, { online: boolean; lastSeenAt: number | null }>;
}

async function fetchPresenceBatch(
	relayUrl: string,
	routingKeys: string[],
	token: string,
): Promise<PresenceResponse> {
	const response = await fetch(
		`${relayUrl}/presence?hostIds=${encodeURIComponent(routingKeys.join(","))}`,
		{ headers: { authorization: `Bearer ${token}` } },
	);
	if (!response.ok) throw new Error(`presence fetch: ${response.status}`);
	return (await response.json()) as PresenceResponse;
}

export function useHostsPresence(
	targets: HostPresenceTarget[],
): Map<string, boolean> | null {
	const routingKeys = useMemo(
		() =>
			[
				...new Set(
					targets
						.filter((target) => target.organizationId && target.machineId)
						.map((target) =>
							buildHostRoutingKey(target.organizationId, target.machineId),
						),
				),
			].sort(),
		[targets],
	);

	const { data: relayUrl } = useQuery({
		queryKey: ["relay-url"],
		staleTime: 5 * 60 * 1000,
		queryFn: async () => {
			await primeRelayUrl();
			return getRelayUrl();
		},
	});

	const enabled = routingKeys.length > 0 && relayUrl !== undefined;

	const { data } = useQuery({
		queryKey: ["hosts-presence", relayUrl, routingKeys.join(",")],
		enabled,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
		queryFn: async (): Promise<Map<string, boolean>> => {
			if (relayUrl === undefined) throw new Error("relay URL unresolved");
			const token = await getHostAuthToken();
			const chunks: string[][] = [];
			for (
				let index = 0;
				index < routingKeys.length;
				index += PRESENCE_BATCH_LIMIT
			) {
				chunks.push(routingKeys.slice(index, index + PRESENCE_BATCH_LIMIT));
			}
			const responses = await Promise.all(
				chunks.map((chunk) => fetchPresenceBatch(relayUrl, chunk, token)),
			);
			const online = new Map<string, boolean>();
			for (const response of responses) {
				for (const [key, info] of Object.entries(response.hosts)) {
					const parsed = parseHostRoutingKey(key);
					if (parsed) online.set(parsed.machineId, info.online);
				}
			}
			return online;
		},
	});

	// Null = presence unavailable (fetch failed, empty target set): callers
	// must keep the isOnline value they already hold.
	return enabled ? (data ?? null) : null;
}
