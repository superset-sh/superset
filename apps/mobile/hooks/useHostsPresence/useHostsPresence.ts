import {
	buildHostRoutingKey,
	parseHostRoutingKey,
} from "@superset/shared/host-routing";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	getHostAuthToken,
	getRelayUrl,
	primeRelayUrl,
} from "@/lib/host/client";
import {
	getPresenceStatus,
	type HostPresenceStatus,
} from "./utils/getPresenceStatus";
import { withDeadline } from "./utils/withDeadline";

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

// Covers the token as well as the request: with the API black-holed the
// token fetch never settles, and an unsettled query stays "pending" forever.
const PRESENCE_DEADLINE_MS = 8_000;

interface PresenceResponse {
	hosts: Record<string, HostPresence>;
}

async function fetchPresenceBatch(
	relayUrl: string,
	routingKeys: string[],
	token: string,
	signal: AbortSignal,
): Promise<PresenceResponse> {
	const response = await fetch(
		`${relayUrl}/presence?hostIds=${encodeURIComponent(routingKeys.join(","))}`,
		{ headers: { authorization: `Bearer ${token}` }, signal },
	);
	if (!response.ok) throw new Error(`presence fetch: ${response.status}`);
	return (await response.json()) as PresenceResponse;
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

	// The prime only refines which relay to ask. Waiting on it would hang
	// presence, and Home with it, whenever the API accepts and never answers.
	const { data: primedRelayUrl } = useQuery({
		queryKey: ["relay-url"],
		staleTime: 5 * 60 * 1000,
		queryFn: async () => {
			await primeRelayUrl();
			return getRelayUrl();
		},
	});
	const relayUrl = primedRelayUrl ?? readRelayUrl();

	const enabled = routingKeys.length > 0 && relayUrl !== undefined;

	const presenceKey = `${relayUrl}|${routingKeys.join(",")}`;
	const { data, failureCount, dataUpdatedAt } = useQuery({
		queryKey: ["hosts-presence", relayUrl, routingKeys.join(",")],
		enabled,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
		queryFn: ({ signal }): Promise<Map<string, HostPresence>> =>
			withDeadline(
				(requestSignal) => loadPresence(relayUrl, routingKeys, requestSignal),
				PRESENCE_DEADLINE_MS,
				signal,
			),
	});

	// react-query zeroes failureCount as each fetch starts, so reading it alone
	// flips "unavailable" back to "pending" on every refetch and Try again.
	const [failedKey, setFailedKey] = useState<string | null>(null);
	useEffect(() => {
		if (failureCount > 0) setFailedKey(presenceKey);
	}, [failureCount, presenceKey]);
	useEffect(() => {
		if (dataUpdatedAt > 0) setFailedKey(null);
	}, [dataUpdatedAt]);

	return {
		presence: routingKeys.length > 0 ? (data ?? null) : null,
		status: getPresenceStatus({
			hasTargets: routingKeys.length > 0,
			hasData: data !== undefined,
			canFetch: relayUrl !== undefined,
			hasFailedSinceSuccess: failureCount > 0 || failedKey === presenceKey,
		}),
	};
}

function readRelayUrl(): string | undefined {
	try {
		return getRelayUrl();
	} catch {
		return undefined;
	}
}

async function loadPresence(
	relayUrl: string | undefined,
	routingKeys: string[],
	signal: AbortSignal,
): Promise<Map<string, HostPresence>> {
	if (relayUrl === undefined) throw new Error("relay URL unresolved");
	const token = await getHostAuthToken({ signal });
	if (signal.aborted) throw new Error("presence request cancelled");
	const chunks: string[][] = [];
	for (
		let index = 0;
		index < routingKeys.length;
		index += PRESENCE_BATCH_LIMIT
	) {
		chunks.push(routingKeys.slice(index, index + PRESENCE_BATCH_LIMIT));
	}
	const responses = await Promise.all(
		chunks.map((chunk) => fetchPresenceBatch(relayUrl, chunk, token, signal)),
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
}
