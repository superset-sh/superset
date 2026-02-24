import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSearchDialogStore } from "renderer/stores/search-dialog-state";
import { useTabsStore } from "renderer/stores/tabs/store";

const SEARCH_LIMIT = 200;

interface UseKeywordSearchParams {
	workspaceId: string;
	worktreePath: string | undefined;
}

interface KeywordSearchResult {
	id: string;
	name: string;
	relativePath: string;
	path: string;
	line: number;
	column: number;
	preview: string;
}

export function useKeywordSearch({
	workspaceId,
	worktreePath,
}: UseKeywordSearchParams) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const includePattern = useSearchDialogStore(
		(state) => state.byMode.keywordSearch.includePattern,
	);
	const excludePattern = useSearchDialogStore(
		(state) => state.byMode.keywordSearch.excludePattern,
	);
	const filtersOpen = useSearchDialogStore(
		(state) => state.byMode.keywordSearch.filtersOpen,
	);
	const setIncludePatternByMode = useSearchDialogStore(
		(state) => state.setIncludePattern,
	);
	const setExcludePatternByMode = useSearchDialogStore(
		(state) => state.setExcludePattern,
	);
	const setFiltersOpenByMode = useSearchDialogStore(
		(state) => state.setFiltersOpen,
	);
	const trimmedQuery = query.trim();

	const { data: searchResults, isFetching } =
		electronTrpc.filesystem.searchKeyword.useQuery(
			{
				rootPath: worktreePath ?? "",
				query: trimmedQuery,
				includePattern,
				excludePattern,
				includeHidden: false,
				limit: SEARCH_LIMIT,
			},
			{
				enabled: open && Boolean(worktreePath) && trimmedQuery.length > 0,
				staleTime: 1000,
				placeholderData: (previous) => previous ?? [],
			},
		);

	const handleOpenChange = useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setQuery("");
		}
	}, []);

	const toggle = useCallback(() => {
		setOpen((prev) => {
			if (prev) {
				setQuery("");
			}
			return !prev;
		});
	}, []);

	const selectMatch = useCallback(
		(match: KeywordSearchResult) => {
			useTabsStore.getState().addFileViewerPane(workspaceId, {
				filePath: match.relativePath,
				line: match.line,
				column: match.column,
			});
			handleOpenChange(false);
		},
		[workspaceId, handleOpenChange],
	);

	const setIncludePattern = useCallback(
		(value: string) => {
			setIncludePatternByMode("keywordSearch", value);
		},
		[setIncludePatternByMode],
	);

	const setExcludePattern = useCallback(
		(value: string) => {
			setExcludePatternByMode("keywordSearch", value);
		},
		[setExcludePatternByMode],
	);

	const setFiltersOpen = useCallback(
		(nextOpen: boolean) => {
			setFiltersOpenByMode("keywordSearch", nextOpen);
		},
		[setFiltersOpenByMode],
	);

	return {
		open,
		query,
		setQuery,
		filtersOpen,
		setFiltersOpen,
		includePattern,
		setIncludePattern,
		excludePattern,
		setExcludePattern,
		handleOpenChange,
		toggle,
		selectMatch,
		searchResults: searchResults ?? [],
		isFetching,
	};
}
