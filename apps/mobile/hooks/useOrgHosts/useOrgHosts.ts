import type { RouterOutputs } from "@superset/trpc";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgHostRow = RouterOutputs["v2Host"]["list"][number];
export type OrgHost = OrgHostRow & { isOnline: boolean };

export const NO_HOSTS: OrgHost[] = [];
const NO_ROWS: OrgHostRow[] = [];

function useOrgHostsQuery(): UseQueryResult<OrgHostRow[]> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "v2Host", "list", organizationId],
		enabled: organizationId !== null,
		queryFn: () =>
			apiClient.v2Host.list.query({ organizationId: organizationId ?? "" }),
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
} {
	const query = useOrgHostsQuery();
	const rows = query.data ?? NO_ROWS;
	const presence = useHostsPresence(rows);
	const hosts = useMemo(
		() =>
			rows.length === 0
				? NO_HOSTS
				: rows.map((row) => ({
						...row,
						isOnline: presence?.get(row.machineId) ?? false,
					})),
		[rows, presence],
	);
	return { hosts, query };
}
