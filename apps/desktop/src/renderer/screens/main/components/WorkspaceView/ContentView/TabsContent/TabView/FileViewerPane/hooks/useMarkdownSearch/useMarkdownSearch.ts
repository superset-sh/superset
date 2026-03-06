import type { RefObject } from "react";
import { useEffect } from "react";
import { useTextSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";
import { useAppHotkey } from "renderer/stores/hotkeys";

interface UseMarkdownSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	isFocused: boolean;
	isRenderedMode: boolean;
	filePath: string;
}

interface UseMarkdownSearchReturn {
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

export function useMarkdownSearch({
	containerRef,
	isFocused,
	isRenderedMode,
	filePath,
}: UseMarkdownSearchOptions): UseMarkdownSearchReturn {
	const textSearch = useTextSearch({
		containerRef,
		highlightPrefix: "markdown-search",
	});

	// Close search when pane loses focus or exits rendered mode
	useEffect(() => {
		if (!isFocused || !isRenderedMode) {
			if (textSearch.isSearchOpen) {
				textSearch.closeSearch();
			}
		}
	}, [
		isFocused,
		isRenderedMode,
		textSearch.closeSearch,
		textSearch.isSearchOpen,
	]);

	// Reset search when file changes so stale Range objects don't linger
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
		{ enabled: isFocused && isRenderedMode, preventDefault: true },
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
