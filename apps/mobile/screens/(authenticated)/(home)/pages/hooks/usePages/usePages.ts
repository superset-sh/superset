import type { RouterOutputs } from "@superset/trpc";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgPage = RouterOutputs["page"]["list"][number];
export type PulledPage = RouterOutputs["page"]["pull"];

export const NO_PAGES: OrgPage[] = [];

/** Pages in the active organization, newest-updated first (the server orders them). */
export function usePagesQuery(): UseQueryResult<OrgPage[]> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "page", "list", organizationId],
		enabled: organizationId !== null,
		queryFn: () => apiClient.page.list.query({}),
		staleTime: 30_000,
	});
}

// The signed ticket in `viewUrl` turns on an hourly boundary, so a cached URL
// outlives the screen but not the day. Refetching on mount keeps a page opened
// from a cold list from loading a URL whose ticket has since rolled.
export function usePageQuery(slug: string): UseQueryResult<PulledPage> {
	return useQuery({
		queryKey: ["cloud", "page", "pull", slug],
		queryFn: () => apiClient.page.pull.query({ slug }),
		refetchOnMount: "always",
	});
}
