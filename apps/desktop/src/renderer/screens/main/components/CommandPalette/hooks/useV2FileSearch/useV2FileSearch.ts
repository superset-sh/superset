import { workspaceTrpc } from "@superset/workspace-client";

const SEARCH_LIMIT = 50;

export function useV2FileSearch(
	workspaceId: string | undefined,
	query: string,
) {
	const trimmedQuery = query.trim();

	const { data, isFetching } = workspaceTrpc.filesystem.searchFiles.useQuery(
		{
			workspaceId: workspaceId ?? "",
			query: trimmedQuery,
			limit: SEARCH_LIMIT,
		},
		{
			enabled: Boolean(workspaceId) && trimmedQuery.length > 0,
			placeholderData: (previous) => previous ?? { matches: [] },
		},
	);

	const results =
		data?.matches.map((match) => ({
			id: match.absolutePath,
			name: match.name,
			path: match.absolutePath,
			relativePath: match.relativePath,
		})) ?? [];

	return { results, isFetching };
}
