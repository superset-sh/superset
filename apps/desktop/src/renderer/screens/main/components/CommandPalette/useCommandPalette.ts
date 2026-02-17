import { useCallback, useState } from "react";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch/useFileSearch";
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

	const { searchResults, isFetching } = useFileSearch({
		worktreePath: open ? worktreePath : undefined,
		searchTerm: query,
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

	return {
		open,
		query,
		setQuery,
		handleOpenChange,
		toggle,
		selectFile,
		searchResults,
		isFetching,
	};
}
