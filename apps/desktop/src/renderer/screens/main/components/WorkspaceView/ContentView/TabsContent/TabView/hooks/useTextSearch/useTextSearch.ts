import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SEARCH_DEBOUNCE_MS = 150;
let nextHighlightInstanceId = 0;

export interface UseTextSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	highlightPrefix: string;
}

export interface UseTextSearchReturn {
	isSearchOpen: boolean;
	setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
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

function supportsCustomHighlights(): boolean {
	return (
		typeof CSS !== "undefined" &&
		typeof Highlight !== "undefined" &&
		Boolean(CSS.highlights)
	);
}

export function useTextSearch({
	containerRef,
	highlightPrefix,
}: UseTextSearchOptions): UseTextSearchReturn {
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [matchCount, setMatchCount] = useState(0);
	const [activeMatchIndex, setActiveMatchIndex] = useState(0);

	const rangesRef = useRef<Range[]>([]);
	const activeMatchIndexRef = useRef(0);
	activeMatchIndexRef.current = activeMatchIndex;
	const wasSearchOpenRef = useRef(false);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const highlightInstanceIdRef = useRef<number | null>(null);

	if (highlightInstanceIdRef.current === null) {
		highlightInstanceIdRef.current = nextHighlightInstanceId;
		nextHighlightInstanceId += 1;
	}

	const highlightKeys = useMemo(() => {
		const id = highlightInstanceIdRef.current;
		return {
			matches: `${highlightPrefix}-matches-${id}`,
			active: `${highlightPrefix}-active-${id}`,
		};
	}, [highlightPrefix]);

	useEffect(() => {
		if (typeof document === "undefined") return;

		// Scoped highlight names avoid collisions across concurrently mounted panes.
		const styleElement = document.createElement("style");
		styleElement.textContent = `
::highlight(${highlightKeys.matches}) {
	background-color: var(--highlight-match);
}
::highlight(${highlightKeys.active}) {
	background-color: var(--highlight-active);
}
`;
		document.head.appendChild(styleElement);

		return () => {
			styleElement.remove();
		};
	}, [highlightKeys.active, highlightKeys.matches]);

	const clearHighlights = useCallback(() => {
		if (supportsCustomHighlights()) {
			CSS.highlights.delete(highlightKeys.matches);
			CSS.highlights.delete(highlightKeys.active);
		}
		rangesRef.current = [];
	}, [highlightKeys.active, highlightKeys.matches]);

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

			if (ranges.length > 0 && supportsCustomHighlights()) {
				const allHighlight = new Highlight();
				for (const range of ranges) {
					allHighlight.add(range);
				}
				CSS.highlights.set(highlightKeys.matches, allHighlight);

				setActiveMatchIndex(0);
				const activeHighlight = new Highlight(ranges[0]);
				CSS.highlights.set(highlightKeys.active, activeHighlight);
				scrollRangeIntoView(ranges[0]);
			} else {
				setActiveMatchIndex(0);
			}
		},
		[
			clearHighlights,
			containerRef,
			highlightKeys.active,
			highlightKeys.matches,
			scrollRangeIntoView,
		],
	);

	const setActiveMatch = useCallback(
		(index: number) => {
			const ranges = rangesRef.current;
			if (ranges.length === 0) return;

			setActiveMatchIndex(index);

			if (supportsCustomHighlights()) {
				CSS.highlights.delete(highlightKeys.active);
				const activeHighlight = new Highlight(ranges[index]);
				CSS.highlights.set(highlightKeys.active, activeHighlight);
			}

			scrollRangeIntoView(ranges[index]);
		},
		[highlightKeys.active, scrollRangeIntoView],
	);

	const findNext = useCallback(() => {
		if (rangesRef.current.length === 0) return;
		const nextIndex =
			(activeMatchIndexRef.current + 1) % rangesRef.current.length;
		setActiveMatch(nextIndex);
	}, [setActiveMatch]);

	const findPrevious = useCallback(() => {
		if (rangesRef.current.length === 0) return;
		const previousIndex =
			(activeMatchIndexRef.current - 1 + rangesRef.current.length) %
			rangesRef.current.length;
		setActiveMatch(previousIndex);
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

	useEffect(() => {
		if (!isSearchOpen) return;

		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
		}

		searchTimerRef.current = setTimeout(() => {
			performSearch(query, caseSensitive);
		}, SEARCH_DEBOUNCE_MS);

		return () => {
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, [caseSensitive, isSearchOpen, performSearch, query]);

	useEffect(() => {
		if (isSearchOpen) {
			wasSearchOpenRef.current = true;
			return;
		}

		if (!wasSearchOpenRef.current) return;
		wasSearchOpenRef.current = false;

		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
			searchTimerRef.current = null;
		}
		setQuery("");
		setMatchCount(0);
		setActiveMatchIndex(0);
		clearHighlights();
	}, [isSearchOpen, clearHighlights]);

	useEffect(() => {
		return () => {
			clearHighlights();
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, [clearHighlights]);

	return {
		isSearchOpen,
		setIsSearchOpen,
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
