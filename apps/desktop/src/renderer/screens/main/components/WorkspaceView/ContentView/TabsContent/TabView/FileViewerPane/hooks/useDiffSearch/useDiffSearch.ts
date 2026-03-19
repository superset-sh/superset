import type { RefObject } from "react";
import { useCallback, useEffect } from "react";
import { useTextSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { getDiffSearchRoots } from "../../utils/diffRendererRoots";

interface UseDiffSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	isFocused: boolean;
	isDiffMode: boolean;
	filePath: string;
}

interface UseDiffSearchReturn {
	isSearchOpen: boolean;
	query: string;
	caseSensitive: boolean;
	matchCount: number;
	activeMatchIndex: number;
	setQuery: (query: string) => void;
	setCaseSensitive: (caseSensitive: boolean) => void;
	findNext: () => void;
	findPrevious: () => void;
	closeSearch: () => void;
}

export function useDiffSearch({
	containerRef,
	isFocused,
	isDiffMode,
	filePath,
}: UseDiffSearchOptions): UseDiffSearchReturn {
	const getSearchRoots = useCallback(
		(container: HTMLDivElement) => getDiffSearchRoots(container),
		[],
	);

	const textSearch = useTextSearch({
		containerRef,
		getSearchRoots,
		highlightPrefix: "diff-search",
	});

	useEffect(() => {
		if (!isFocused || !isDiffMode) {
			if (textSearch.isSearchOpen) {
				textSearch.closeSearch();
			}
		}
	}, [isFocused, isDiffMode, textSearch.closeSearch, textSearch.isSearchOpen]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		if (textSearch.isSearchOpen) {
			textSearch.closeSearch();
		}
	}, [filePath]);

	useAppHotkey(
		"FIND_IN_FILE_VIEWER",
		() => {
			if (textSearch.isSearchOpen) {
				textSearch.closeSearch();
				return;
			}
			textSearch.setIsSearchOpen(true);
		},
		{ enabled: isFocused && isDiffMode, preventDefault: true },
	);

	return {
		isSearchOpen: textSearch.isSearchOpen,
		query: textSearch.query,
		caseSensitive: textSearch.caseSensitive,
		matchCount: textSearch.matchCount,
		activeMatchIndex: textSearch.activeMatchIndex,
		setQuery: textSearch.setQuery,
		setCaseSensitive: textSearch.setCaseSensitive,
		findNext: textSearch.findNext,
		findPrevious: textSearch.findPrevious,
		closeSearch: textSearch.closeSearch,
	};
}
