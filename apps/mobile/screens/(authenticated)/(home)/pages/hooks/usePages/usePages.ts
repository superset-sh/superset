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

// `page.pull` mints a version-bound ticket on a 24h window, so a cached
// `viewUrl` stays loadable far longer than a session — what a refetch is
// actually for is picking up a version published while the page sat in cache.
// The sheets read this same query, so refetching on every mount would spend a
// pull per sheet open on a URL that cannot have changed.
const PULLED_PAGE_STALE_MS = 5 * 60_000;

export function usePageQuery(slug: string): UseQueryResult<PulledPage> {
	return useQuery({
		queryKey: ["cloud", "page", "pull", slug],
		queryFn: () => apiClient.page.pull.query({ slug }),
		staleTime: PULLED_PAGE_STALE_MS,
	});
}
