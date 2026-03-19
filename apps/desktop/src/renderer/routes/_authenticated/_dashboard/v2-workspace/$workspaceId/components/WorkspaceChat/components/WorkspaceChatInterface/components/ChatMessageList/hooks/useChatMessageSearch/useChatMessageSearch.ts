import type { RefObject } from "react";
import { useEffect } from "react";
import { useTextSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";
import { useAppHotkey } from "renderer/stores/hotkeys";

interface UseChatMessageSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	isFocused: boolean;
}

interface UseChatMessageSearchReturn {
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

export function useChatMessageSearch({
	containerRef,
	isFocused,
}: UseChatMessageSearchOptions): UseChatMessageSearchReturn {
	const textSearch = useTextSearch({
		containerRef,
		highlightPrefix: "chat-search",
	});

	useEffect(() => {
		if (!isFocused && textSearch.isSearchOpen) {
			textSearch.closeSearch();
		}
	}, [isFocused, textSearch.closeSearch, textSearch.isSearchOpen]);

	useAppHotkey(
		"FIND_IN_CHAT",
		() => {
			if (textSearch.isSearchOpen) {
				textSearch.closeSearch();
				return;
			}
			textSearch.setIsSearchOpen(true);
		},
		{ enabled: isFocused, preventDefault: true },
		[textSearch.closeSearch, textSearch.isSearchOpen],
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
