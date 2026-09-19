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

/** `lastSeenAt` is null for a host that has never opened a relay tunnel. */
export interface HostPresence {
	online: boolean;
	lastSeenAt: number | null;
}

/**
 * "pending" has no answer yet and "unavailable" could not get one. Neither
 * says a host is offline, so callers must not render them as if it did.
 */
export type HostPresenceStatus = "pending" | "ready" | "unavailable";

const PRESENCE_TIMEOUT_MS = 8_000;

interface PresenceResponse {
	hosts: Record<string, HostPresence>;
}

async function fetchPresenceBatch(
	relayUrl: string,
	routingKeys: string[],
	token: string,
): Promise<PresenceResponse> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PRESENCE_TIMEOUT_MS);
	try {
		const response = await fetch(
			`${relayUrl}/presence?hostIds=${encodeURIComponent(routingKeys.join(","))}`,
			{
				headers: { authorization: `Bearer ${token}` },
				signal: controller.signal,
			},
		);
		if (!response.ok) throw new Error(`presence fetch: ${response.status}`);
		return (await response.json()) as PresenceResponse;
	} finally {
		clearTimeout(timer);
	}
}

export function useHostsPresence(targets: HostPresenceTarget[]): {
	presence: Map<string, HostPresence> | null;
	status: HostPresenceStatus;
} {
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

	const { data, failureCount } = useQuery({
		queryKey: ["hosts-presence", relayUrl, routingKeys.join(",")],
		enabled,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
		queryFn: async (): Promise<Map<string, HostPresence>> => {
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
			const presence = new Map<string, HostPresence>();
			for (const response of responses) {
				for (const [key, info] of Object.entries(response.hosts)) {
					const parsed = parseHostRoutingKey(key);
					if (parsed) {
						presence.set(parsed.machineId, {
							online: info.online,
							lastSeenAt: info.lastSeenAt,
						});
					}
				}
			}
			return presence;
		},
	});

	if (routingKeys.length === 0) return { presence: null, status: "ready" };
	if (data) return { presence: data, status: "ready" };
	// A first failure is already an answer: retries run on in the background,
	// but holding "pending" through their backoff would stall Home for ~10s.
	return {
		presence: null,
		status: enabled && failureCount > 0 ? "unavailable" : "pending",
	};
}
