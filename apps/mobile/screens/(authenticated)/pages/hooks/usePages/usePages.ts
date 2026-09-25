import type { RouterOutputs } from "@superset/trpc";
import type { PageListScope } from "@superset/trpc/page-schema";
import {
	type UseQueryResult,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgPage = RouterOutputs["page"]["listPaginated"]["items"][number];
export type PulledPage = RouterOutputs["page"]["pull"];

export const NO_PAGES: OrgPage[] = [];

const PAGES_PER_REQUEST = 50;

/** One batch per `onEndReached`, rather than every page up front. */
export function usePagesQuery(scope: PageListScope = "all") {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = useInfiniteQuery({
		queryKey: ["cloud", "page", "list", organizationId, scope],
		enabled: organizationId !== null,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			apiClient.page.listPaginated.query(
				{
					limit: PAGES_PER_REQUEST,
					scope,
					...(pageParam ? { cursor: pageParam } : {}),
				},
				{ signal },
			),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 30_000,
	});

	const items = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? NO_PAGES,
		[query.data],
	);

	return { ...query, items };
}

export function useWorkspacePagesQuery(workspaceId: string | null) {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = useInfiniteQuery({
		queryKey: [
			"cloud",
			"page",
			"list",
			organizationId,
			"workspace",
			workspaceId,
		],
		enabled: organizationId !== null && workspaceId !== null,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			apiClient.page.listPaginated.query(
				{
					limit: PAGES_PER_REQUEST,
					workspaceId: workspaceId ?? "",
					...(pageParam ? { cursor: pageParam } : {}),
				},
				{ signal },
			),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 30_000,
	});

	const items = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? NO_PAGES,
		[query.data],
	);

	return { ...query, items };
}

const PULLED_PAGE_STALE_MS = 5 * 60_000;

export function usePageQuery(slug: string): UseQueryResult<PulledPage> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "page", "pull", organizationId, slug],
		queryFn: () => apiClient.page.pull.query({ slug }),
		enabled: Boolean(slug),
		staleTime: PULLED_PAGE_STALE_MS,
		retry: false,
	});
}
