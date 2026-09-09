import type { RouterOutputs } from "@superset/trpc";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgPage = RouterOutputs["page"]["list"][number];
export type PulledPage = RouterOutputs["page"]["pull"];

export const NO_PAGES: OrgPage[] = [];

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

const PULLED_PAGE_STALE_MS = 5 * 60_000;

export function usePageQuery(slug: string): UseQueryResult<PulledPage> {
	return useQuery({
		queryKey: ["cloud", "page", "pull", slug],
		queryFn: () => apiClient.page.pull.query({ slug }),
		staleTime: PULLED_PAGE_STALE_MS,
		retry: false,
	});
}
