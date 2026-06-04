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

	const { data: searchResults, isFetching } =
		electronTrpc.filesystem.searchFiles.useQuery(
			{
				workspaceId: workspaceId ?? "",
				query: trimmedQuery,
				includePattern,
				excludePattern,
				limit,
			},
			{
				enabled: Boolean(workspaceId) && trimmedQuery.length > 0,
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
		isFetching,
		hasQuery: trimmedQuery.length > 0,
	};
}
