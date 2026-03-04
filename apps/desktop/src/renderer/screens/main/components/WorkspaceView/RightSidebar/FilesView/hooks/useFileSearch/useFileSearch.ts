import { electronTrpc } from "renderer/lib/electron-trpc";
import { SEARCH_RESULT_LIMIT } from "../../constants";

interface UseFileSearchParams {
	worktreePath: string | undefined;
	searchTerm: string;
	includePattern?: string;
	excludePattern?: string;
	includeHidden: boolean;
	limit?: number;
}

export function useFileSearch({
	worktreePath,
	searchTerm,
	includePattern = "",
	excludePattern = "",
	includeHidden,
	limit = SEARCH_RESULT_LIMIT,
}: UseFileSearchParams) {
	const trimmedQuery = searchTerm.trim();

	const { data: searchResults, isFetching } =
		electronTrpc.filesystem.searchFiles.useQuery(
			{
				rootPath: worktreePath ?? "",
				query: trimmedQuery,
				includePattern,
				excludePattern,
				includeHidden,
				limit,
			},
			{
				enabled: Boolean(worktreePath) && trimmedQuery.length > 0,
				staleTime: 1000,
				placeholderData: (previous) => previous ?? [],
			},
		);

	return {
		searchResults: searchResults ?? [],
		isFetching,
		hasQuery: trimmedQuery.length > 0,
	};
}
