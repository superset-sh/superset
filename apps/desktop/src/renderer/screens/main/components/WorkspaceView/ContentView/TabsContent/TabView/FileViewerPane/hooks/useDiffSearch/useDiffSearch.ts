import { DIFFS_TAG_NAME } from "@pierre/diffs";
import type { RefObject } from "react";
import { useCallback, useEffect } from "react";
import { useTextSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";
import { useAppHotkey } from "renderer/stores/hotkeys";

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
	const getSearchRoots = useCallback((container: HTMLDivElement) => {
		const diffContainers = Array.from(
			container.querySelectorAll<HTMLElement>(DIFFS_TAG_NAME),
		);
		const searchRoots: Array<Node & ParentNode> = [];

		for (const diffContainer of diffContainers) {
			const shadowRoot = diffContainer.shadowRoot;
			if (!shadowRoot) {
				continue;
			}

			const contentColumns = Array.from(
				shadowRoot.querySelectorAll<HTMLElement>("[data-column-content]"),
			);

			if (contentColumns.length === 0) {
				searchRoots.push(shadowRoot);
				continue;
			}

			searchRoots.push(...contentColumns);
		}

		return searchRoots;
	}, []);

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
