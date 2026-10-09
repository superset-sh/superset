import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function usePullRequestEvidence(workspaceId: string, enabled: boolean) {
	const options = {
		enabled,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	};
	const pages = cloudTrpc.page.listPaginated.useQuery(
		{ workspaceId, limit: 3 },
		options,
	);
	const counts = cloudTrpc.page.counts.useQuery({ workspaceId }, options);

	return {
		pages: pages.data?.items ?? [],
		totalCount: counts.data?.all,
		hasMore: pages.data?.nextCursor != null,
		isPending: pages.isPending,
		isError: pages.isError,
		onRetry: () => {
			void pages.refetch();
			void counts.refetch();
		},
	};
}
