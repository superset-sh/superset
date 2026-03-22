import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SEARCH_RESULT_LIMIT } from "../../constants";

interface UseFileSearchParams {
	workspaceId: string | undefined;
	searchTerm: string;
	includePattern?: string;
	excludePattern?: string;
	limit?: number;
}

export function useFileSearch({
	workspaceId,
	searchTerm,
	includePattern = "",
	excludePattern = "",
	limit = SEARCH_RESULT_LIMIT,
}: UseFileSearchParams) {
	const trimmedQuery = searchTerm.trim();
	const debouncedQuery = useDebouncedValue(trimmedQuery, 150);
	const isDebouncing =
		trimmedQuery.length > 0 && trimmedQuery !== debouncedQuery;

	const { data: searchResults, isFetching } =
		electronTrpc.filesystem.searchFiles.useQuery(
			{
				workspaceId: workspaceId ?? "",
				query: debouncedQuery,
				includePattern,
				excludePattern,
				limit,
			},
			{
				enabled: Boolean(workspaceId) && debouncedQuery.length > 0,
				staleTime: 1000,
				placeholderData: (previous) => previous ?? { matches: [] },
			},
		);

	const results =
		searchResults?.matches.map((match) => ({
			id: match.absolutePath,
			name: match.name,
			path: match.absolutePath,
			relativePath: match.relativePath,
			isDirectory: match.kind === "directory",
			score: match.score,
		})) ?? [];

	return {
		searchResults: results,
		isFetching: isFetching || isDebouncing,
		hasQuery: trimmedQuery.length > 0,
	};
}
