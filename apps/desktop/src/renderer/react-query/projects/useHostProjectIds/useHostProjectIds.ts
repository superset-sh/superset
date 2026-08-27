import { queryOptions, useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const hostProjectListQueryKey = (hostUrl: string | null) =>
	["project", "list", hostUrl] as const;

/**
 * A host that isn't reachable yet (booting, relay tunnel not up) answers
 * every call with an error; keep asking at this cadence while a composer is
 * mounted so the set fills in once it comes online.
 */
export const HOST_PROJECT_LIST_RETRY_MS = 10_000;

/**
 * Failures stay failures: caching `null` as a successful result would pin
 * "unknown" for the lifetime of the mounted screen, and the setup notice
 * would never appear for a host that came online a moment later.
 */
export const hostProjectIdsQueryOptions = (hostUrl: string | null) =>
	queryOptions({
		queryKey: hostProjectListQueryKey(hostUrl),
		enabled: !!hostUrl,
		queryFn: async (): Promise<Set<string>> => {
			if (!hostUrl) throw new Error("hostProjectIds: no host url");
			const client = getHostServiceClientByUrl(hostUrl);
			const rows = await client.project.list.query();
			return new Set(rows.map((row) => row.id));
		},
		refetchInterval: (query) =>
			query.state.data ? false : HOST_PROJECT_LIST_RETRY_MS,
	});

/**
 * IDs of projects already set up on the given host. Returns `null` while the
 * host can't be reached (treat as "unknown" — no setup indicator).
 */
export function useHostProjectIds(hostUrl: string | null): Set<string> | null {
	const { data } = useQuery(hostProjectIdsQueryOptions(hostUrl));
	return data ?? null;
}
