import { workspaceTrpc } from "@superset/workspace-client";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { SEARCH_RESULT_LIMIT } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/constants";

interface UseWorkspaceFileSearchParams {
	workspaceId: string;
	searchTerm: string;
	limit?: number;
}

export function useWorkspaceFileSearch({
	workspaceId,
	searchTerm,
	limit = SEARCH_RESULT_LIMIT,
}: UseWorkspaceFileSearchParams) {
	const trimmedQuery = searchTerm.trim();
	const debouncedQuery = useDebouncedValue(trimmedQuery, 150);
	const isDebouncing =
		trimmedQuery.length > 0 && trimmedQuery !== debouncedQuery;

	const { data: searchResults, isFetching } =
		workspaceTrpc.filesystem.searchFiles.useQuery(
			{
				workspaceId,
				query: debouncedQuery,
				limit,
			},
			{
				enabled: debouncedQuery.length > 0,
				placeholderData: (previous) => previous ?? { matches: [] },
				staleTime: 1000,
			},
		);

	return {
		searchResults:
			searchResults?.matches.map((match) => ({
				absolutePath: match.absolutePath,
				isDirectory: match.kind === "directory",
				name: match.name,
				relativePath: match.relativePath,
			})) ?? [],
		isFetching: isFetching || isDebouncing,
		hasQuery: trimmedQuery.length > 0,
	};
}
