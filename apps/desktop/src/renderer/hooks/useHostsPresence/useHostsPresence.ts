import {
	buildHostRoutingKey,
	parseHostRoutingKey,
} from "@superset/shared/host-routing";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getJwt } from "renderer/lib/auth-client";

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
	jwt: string,
): Promise<PresenceResponse> {
	const response = await fetch(
		`${relayUrl}/presence?hostIds=${encodeURIComponent(routingKeys.join(","))}`,
		{ headers: { authorization: `Bearer ${jwt}` } },
	);
	if (!response.ok) throw new Error(`presence fetch: ${response.status}`);
	return (await response.json()) as PresenceResponse;
}

export function useHostsPresence(
	targets: HostPresenceTarget[],
): Map<string, boolean> | null {
	const relayUrl = useRelayUrl();

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

	const { data: relayIsProto2 } = useQuery({
		queryKey: ["relay-proto", relayUrl],
		staleTime: Number.POSITIVE_INFINITY,
		retry: 1,
		queryFn: async () => {
			const response = await fetch(`${relayUrl}/health`);
			if (!response.ok) throw new Error(`relay health: ${response.status}`);
			const body = (await response.json()) as { proto?: number };
			return body.proto === 2;
		},
	});

	const enabled = routingKeys.length > 0 && relayIsProto2 === true;

	const { data } = useQuery({
		queryKey: ["hosts-presence", relayUrl, routingKeys.join(",")],
		enabled,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
		queryFn: async (): Promise<Map<string, boolean>> => {
			const jwt = getJwt();
			if (!jwt) throw new Error("no JWT for presence fetch");
			const chunks: string[][] = [];
			for (
				let index = 0;
				index < routingKeys.length;
				index += PRESENCE_BATCH_LIMIT
			) {
				chunks.push(routingKeys.slice(index, index + PRESENCE_BATCH_LIMIT));
			}
			const responses = await Promise.all(
				chunks.map((chunk) => fetchPresenceBatch(relayUrl, chunk, jwt)),
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

	// Null = presence unavailable (v1 relay, probe/fetch failed, empty target
	// set): callers must keep the cloud row's isOnline value.
	return enabled ? (data ?? null) : null;
}
