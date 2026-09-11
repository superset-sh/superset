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

/**
 * The roster of hosts in the active organization: membership only, so it is
 * fetched on mount and focus, never polled. Presence comes from the relay via
 * useOrgHosts.
 */
export function useOrgHostsQuery(): UseQueryResult<OrgHostRow[]> {
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

/** Hosts in the active organization with relay presence merged in. */
export function useOrgHosts(): OrgHost[] {
	const query = useOrgHostsQuery();
	const rows = query.data ?? NO_ROWS;
	const presence = useHostsPresence(rows);
	return useMemo(
		() =>
			rows.length === 0
				? NO_HOSTS
				: rows.map((row) => ({
						...row,
						isOnline: presence?.get(row.machineId) ?? false,
					})),
		[rows, presence],
	);
}
