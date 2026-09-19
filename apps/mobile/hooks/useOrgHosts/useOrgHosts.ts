import type { RouterOutputs } from "@superset/trpc";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type HostPresenceStatus,
	useHostsPresence,
} from "@/hooks/useHostsPresence";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgHostRow = RouterOutputs["host"]["roster"][number];
export type OrgHost = OrgHostRow & {
	isOnline: boolean;
	/** Null = never reached the relay; absent = presence unavailable. */
	lastSeenAt?: number | null;
};

export const NO_HOSTS: OrgHost[] = [];
const NO_ROWS: OrgHostRow[] = [];

function useOrgHostsQuery(): UseQueryResult<OrgHostRow[]> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "host", "roster", organizationId],
		enabled: organizationId !== null,
		queryFn: () =>
			apiClient.host.roster.query({ organizationId: organizationId ?? "" }),
		staleTime: 30_000,
	});
}

/**
 * Hosts in the active organization with relay presence merged in. The roster
 * is membership only, fetched on mount and focus and never polled; `query` is
 * the raw roster query for pending, error and refetch.
 */
export function useOrgHosts(): {
	hosts: OrgHost[];
	query: UseQueryResult<OrgHostRow[]>;
	presenceStatus: HostPresenceStatus;
} {
	const query = useOrgHostsQuery();
	const rows = query.data ?? NO_ROWS;
	const { presence, status: presenceStatus } = useHostsPresence(rows);
	const hosts = useMemo(
		() =>
			rows.length === 0
				? NO_HOSTS
				: rows.map((row) => {
						const info = presence?.get(row.machineId);
						return {
							...row,
							isOnline: info?.online ?? false,
							lastSeenAt: info?.lastSeenAt,
						};
					}),
		[rows, presence],
	);
	return { hosts, query, presenceStatus };
}
