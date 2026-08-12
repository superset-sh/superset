import type { RouterOutputs } from "@superset/trpc";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgHost = RouterOutputs["v2Host"]["list"][number];

const HOSTS_REFETCH_INTERVAL_MS = 30_000;
export const NO_HOSTS: OrgHost[] = [];

/** Raw query for hosts in the active organization — use when callers need pending/error state. */
export function useOrgHostsQuery(): UseQueryResult<OrgHost[]> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "v2Host", "list", organizationId],
		enabled: organizationId !== null,
		queryFn: () => apiClient.v2Host.list.query(),
		refetchInterval: HOSTS_REFETCH_INTERVAL_MS,
		staleTime: 30_000,
	});
}

/** Hosts in the active organization, polled so online/offline stays current. */
export function useOrgHosts(): OrgHost[] {
	const query = useOrgHostsQuery();
	return query.data ?? NO_HOSTS;
}
