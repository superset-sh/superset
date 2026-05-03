import type { AppRouter } from "@superset/host-service";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import { useHostTargetUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { WorkspaceHostTarget } from "../../components/DevicePicker";

type SearchBranchesInput =
	inferRouterInputs<AppRouter>["workspaceCreation"]["searchBranches"];
type SearchBranchesOutput =
	inferRouterOutputs<AppRouter>["workspaceCreation"]["searchBranches"];

export type BranchFilter = NonNullable<SearchBranchesInput["filter"]>;
export type BranchRow = SearchBranchesOutput["items"][number];
type BranchPage = SearchBranchesOutput;

const PAGE_SIZE = 50;

/**
 * Paginated branch search via host-service. First page of a
 * (projectId, host, query, filter) tuple asks to refresh remote refs;
 * the host-service enforces a TTL so rapid typing doesn't thrash `git fetch`.
 */
export function useBranchContext(
	projectId: string | null,
	hostTarget: WorkspaceHostTarget,
	query: string,
	filter: BranchFilter = "all",
) {
	const hostUrl = useHostTargetUrl(hostTarget);

	const q = useInfiniteQuery({
		queryKey: [
			"workspaceCreation",
			"searchBranches",
			projectId,
			hostUrl,
			query,
			filter,
		],
		enabled: !!projectId && !!hostUrl,
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last: BranchPage) => last.nextCursor ?? undefined,
		queryFn: async ({ pageParam }): Promise<BranchPage> => {
			if (!hostUrl || !projectId) {
				return { defaultBranch: null, items: [], nextCursor: null };
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchBranches.query({
				projectId,
				query: query || undefined,
				cursor: pageParam,
				limit: PAGE_SIZE,
				refresh: pageParam === undefined,
				filter,
			});
		},
	});

	const pages = q.data?.pages as BranchPage[] | undefined;
	const branches = useMemo<BranchRow[]>(
		() => pages?.flatMap((p) => p.items) ?? [],
		[pages],
	);

	const defaultBranch = pages?.[0]?.defaultBranch ?? null;

	return {
		branches,
		defaultBranch,
		isLoading: q.isLoading,
		isError: q.isError,
		isFetchingNextPage: q.isFetchingNextPage,
		hasNextPage: q.hasNextPage,
		fetchNextPage: q.fetchNextPage,
	};
}
