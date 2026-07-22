import { useMaybeWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";

const SEARCH_LIMIT = 50;

// Not a workspaceTrpc hook: the CommandPalette also mounts on v1 surfaces
// with no WorkspaceClientProvider, where those hooks throw.
export function useV2FileSearch(
	workspaceId: string | undefined,
	query: string,
) {
	const trimmedQuery = query.trim();
	const workspaceClient = useMaybeWorkspaceClient();

	const { data, isFetching } = useQuery({
		queryKey: ["v2-file-search", workspaceId ?? "", trimmedQuery],
		queryFn: () => {
			if (!workspaceClient) throw new Error("workspace client unavailable");
			return workspaceClient.trpcClient.filesystem.searchFiles.query({
				workspaceId: workspaceId ?? "",
				query: trimmedQuery,
				limit: SEARCH_LIMIT,
			});
		},
		enabled:
			workspaceClient !== null &&
			Boolean(workspaceId) &&
			trimmedQuery.length > 0,
		placeholderData: (previous) => previous ?? { matches: [] },
	});

	const results =
		data?.matches.map((match) => ({
			id: match.absolutePath,
			name: match.name,
			path: match.absolutePath,
			relativePath: match.relativePath,
		})) ?? [];

	return { results, isFetching };
}
