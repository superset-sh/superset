import { useCallback, useState } from "react";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch/useFileSearch";
import { useSearchDialogStore } from "renderer/stores/search-dialog-state";
import { useTabsStore } from "renderer/stores/tabs/store";

const SEARCH_LIMIT = 50;

interface UseCommandPaletteParams {
	workspaceId: string;
	worktreePath: string | undefined;
}

export function useCommandPalette({
	workspaceId,
	worktreePath,
}: UseCommandPaletteParams) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const includePattern = useSearchDialogStore(
		(state) => state.byMode.quickOpen.includePattern,
	);
	const excludePattern = useSearchDialogStore(
		(state) => state.byMode.quickOpen.excludePattern,
	);
	const filtersOpen = useSearchDialogStore(
		(state) => state.byMode.quickOpen.filtersOpen,
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

	const { searchResults, isFetching } = useFileSearch({
		worktreePath: open ? worktreePath : undefined,
		searchTerm: query,
		includePattern,
		excludePattern,
		includeHidden: false,
		limit: SEARCH_LIMIT,
	});

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

	const selectFile = useCallback(
		(filePath: string) => {
			useTabsStore.getState().addFileViewerPane(workspaceId, { filePath });
			handleOpenChange(false);
		},
		[workspaceId, handleOpenChange],
	);

	const setIncludePattern = useCallback(
		(value: string) => {
			setIncludePatternByMode("quickOpen", value);
		},
		[setIncludePatternByMode],
	);

	const setExcludePattern = useCallback(
		(value: string) => {
			setExcludePatternByMode("quickOpen", value);
		},
		[setExcludePatternByMode],
	);

	const setFiltersOpen = useCallback(
		(nextOpen: boolean) => {
			setFiltersOpenByMode("quickOpen", nextOpen);
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
		selectFile,
		searchResults,
		isFetching,
	};
}
