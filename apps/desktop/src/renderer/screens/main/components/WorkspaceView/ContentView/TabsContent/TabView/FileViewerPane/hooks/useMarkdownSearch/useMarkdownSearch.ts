import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [matchCount, setMatchCount] = useState(0);
	const [activeMatchIndex, setActiveMatchIndex] = useState(0);

	const rangesRef = useRef<Range[]>([]);
	const activeMatchIndexRef = useRef(0);
	activeMatchIndexRef.current = activeMatchIndex;
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// CSS.highlights is a global singleton — the fixed keys "markdown-search-matches"
	// and "markdown-search-active" are shared across all panes, so only one pane's
	// search can own them at a time. This is mitigated by auto-closing search on
	// focus loss (see effect below), and the rangesRef guard here prevents one
	// pane's cleanup from clearing highlights that belong to another pane.
	const clearHighlights = useCallback(() => {
		if (rangesRef.current.length === 0) return;
		if (typeof CSS !== "undefined" && CSS.highlights) {
			CSS.highlights.delete("markdown-search-matches");
			CSS.highlights.delete("markdown-search-active");
		}
		rangesRef.current = [];
	}, []);

	const scrollRangeIntoView = useCallback((range: Range) => {
		range.startContainer.parentElement?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	}, []);

	const performSearch = useCallback(
		(searchQuery: string, isCaseSensitive: boolean) => {
			clearHighlights();

			const container = containerRef.current;
			if (!container || !searchQuery) {
				setMatchCount(0);
				setActiveMatchIndex(0);
				return;
			}

			const normalizedQuery = isCaseSensitive
				? searchQuery
				: searchQuery.toLowerCase();

			const ranges: Range[] = [];
			const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

			for (
				let node = walker.nextNode() as Text | null;
				node !== null;
				node = walker.nextNode() as Text | null
			) {
				const text = isCaseSensitive
					? node.textContent
					: node.textContent?.toLowerCase();
				if (!text) continue;

				let startIdx = 0;
				while (startIdx < text.length) {
					const idx = text.indexOf(normalizedQuery, startIdx);
					if (idx === -1) break;

					const range = new Range();
					range.setStart(node, idx);
					range.setEnd(node, idx + searchQuery.length);
					ranges.push(range);
					startIdx = idx + 1;
				}
			}

			rangesRef.current = ranges;
			setMatchCount(ranges.length);

			if (ranges.length > 0 && typeof CSS !== "undefined" && CSS.highlights) {
				const allHighlight = new Highlight();
				for (const r of ranges) allHighlight.add(r);
				CSS.highlights.set("markdown-search-matches", allHighlight);

				setActiveMatchIndex(0);
				const activeHighlight = new Highlight(ranges[0]);
				CSS.highlights.set("markdown-search-active", activeHighlight);
				scrollRangeIntoView(ranges[0]);
			} else {
				setActiveMatchIndex(0);
			}
		},
		[containerRef, clearHighlights, scrollRangeIntoView],
	);

	const setActiveMatch = useCallback(
		(index: number) => {
			const ranges = rangesRef.current;
			if (ranges.length === 0) return;

			setActiveMatchIndex(index);

			if (typeof CSS !== "undefined" && CSS.highlights) {
				CSS.highlights.delete("markdown-search-active");
				const activeHighlight = new Highlight(ranges[index]);
				CSS.highlights.set("markdown-search-active", activeHighlight);
			}

			scrollRangeIntoView(ranges[index]);
		},
		[scrollRangeIntoView],
	);

	const findNext = useCallback(() => {
		if (rangesRef.current.length === 0) return;
		const nextIndex =
			(activeMatchIndexRef.current + 1) % rangesRef.current.length;
		setActiveMatch(nextIndex);
	}, [setActiveMatch]);

	const findPrevious = useCallback(() => {
		if (rangesRef.current.length === 0) return;
		const prevIndex =
			(activeMatchIndexRef.current - 1 + rangesRef.current.length) %
			rangesRef.current.length;
		setActiveMatch(prevIndex);
	}, [setActiveMatch]);

	const closeSearch = useCallback(() => {
		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
			searchTimerRef.current = null;
		}
		setIsSearchOpen(false);
		setQuery("");
		setMatchCount(0);
		setActiveMatchIndex(0);
		clearHighlights();
	}, [clearHighlights]);

	// Debounce the DOM walk so we don't re-traverse on every keystroke
	useEffect(() => {
		if (!isSearchOpen) return;

		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
		}

		searchTimerRef.current = setTimeout(() => {
			performSearch(query, caseSensitive);
		}, 150);

		return () => {
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, [query, caseSensitive, isSearchOpen, performSearch]);

	// Close search when pane loses focus or exits rendered mode
	useEffect(() => {
		if (!isFocused || !isRenderedMode) {
			if (isSearchOpen) {
				closeSearch();
			}
		}
	}, [isFocused, isRenderedMode, isSearchOpen, closeSearch]);

	// Reset search when file changes so stale Range objects don't linger
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		if (isSearchOpen) {
			closeSearch();
		}
	}, [filePath]);

	// Clean up on unmount
	useEffect(() => {
		return () => {
			clearHighlights();
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, [clearHighlights]);

	useAppHotkey(
		"FIND_IN_FILE_VIEWER",
		() => setIsSearchOpen((prev) => !prev),
		{ enabled: isFocused && isRenderedMode, preventDefault: true },
		[isFocused, isRenderedMode],
	);

	return {
		isSearchOpen,
		query,
		caseSensitive,
		matchCount,
		activeMatchIndex,
		setQuery,
		setCaseSensitive,
		findNext,
		findPrevious,
		closeSearch,
	};
}
