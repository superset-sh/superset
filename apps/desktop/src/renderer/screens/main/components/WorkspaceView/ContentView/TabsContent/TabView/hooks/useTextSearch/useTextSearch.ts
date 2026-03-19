import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	findTextRanges,
	getHighlightStyleContainers,
	type SearchRootIndexCache,
} from "./utils/textSearchDom";

const SEARCH_DEBOUNCE_MS = 150;
let nextHighlightInstanceId = 0;

export interface UseTextSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	highlightPrefix: string;
	getSearchRoots?: (container: HTMLDivElement) => Array<Node & ParentNode>;
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
	getSearchRoots,
}: UseTextSearchOptions): UseTextSearchReturn {
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [matchCount, setMatchCount] = useState(0);
	const [activeMatchIndex, setActiveMatchIndex] = useState(0);

	const rangesRef = useRef<Range[]>([]);
	const activeMatchIndexRef = useRef(0);
	activeMatchIndexRef.current = activeMatchIndex;
	const queryRef = useRef(query);
	queryRef.current = query;
	const caseSensitiveRef = useRef(caseSensitive);
	caseSensitiveRef.current = caseSensitive;
	const wasSearchOpenRef = useRef(false);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const highlightInstanceIdRef = useRef<number | null>(null);
	const highlightStyleElementsRef = useRef(
		new Map<HTMLHeadElement | ShadowRoot, HTMLStyleElement>(),
	);
	const searchIndexCacheRef = useRef<SearchRootIndexCache>(new WeakMap());

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

	const highlightStyles = useMemo(
		() => `
::highlight(${highlightKeys.matches}) {
	background-color: var(--highlight-match);
}
::highlight(${highlightKeys.active}) {
	background-color: var(--highlight-active);
}
`,
		[highlightKeys.active, highlightKeys.matches],
	);

	const getResolvedSearchRoots = useCallback(() => {
		const container = containerRef.current;
		if (!container) {
			return [] as Array<Node & ParentNode>;
		}

		return getSearchRoots?.(container) ?? [container];
	}, [containerRef, getSearchRoots]);

	const ensureHighlightStyles = useCallback(
		(searchRoots: Array<Node & ParentNode>) => {
			if (typeof document === "undefined") return;

			const styleContainers = new Set(
				getHighlightStyleContainers(searchRoots, document),
			);

			for (const [
				styleContainer,
				styleElement,
			] of highlightStyleElementsRef.current) {
				if (styleContainers.has(styleContainer)) {
					continue;
				}

				styleElement.remove();
				highlightStyleElementsRef.current.delete(styleContainer);
			}

			for (const styleContainer of styleContainers) {
				if (highlightStyleElementsRef.current.has(styleContainer)) {
					continue;
				}

				const styleElement = document.createElement("style");
				styleElement.textContent = highlightStyles;
				styleContainer.appendChild(styleElement);
				highlightStyleElementsRef.current.set(styleContainer, styleElement);
			}
		},
		[highlightStyles],
	);

	const clearHighlights = useCallback(() => {
		if (supportsCustomHighlights()) {
			CSS.highlights.delete(highlightKeys.matches);
			CSS.highlights.delete(highlightKeys.active);
		}
		rangesRef.current = [];
	}, [highlightKeys.active, highlightKeys.matches]);

	const clearSearchIndexCache = useCallback(() => {
		searchIndexCacheRef.current = new WeakMap();
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

			const searchRoots = getResolvedSearchRoots();
			if (searchRoots.length === 0 || !searchQuery) {
				setMatchCount(0);
				setActiveMatchIndex(0);
				return;
			}

			ensureHighlightStyles(searchRoots);

			const ranges = findTextRanges({
				indexCache: searchIndexCacheRef.current,
				searchRoots,
				searchQuery,
				caseSensitive: isCaseSensitive,
			});

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
			ensureHighlightStyles,
			getResolvedSearchRoots,
			highlightKeys.active,
			highlightKeys.matches,
			scrollRangeIntoView,
		],
	);

	const scheduleSearch = useCallback(
		(
			searchQuery = queryRef.current,
			isCaseSensitive = caseSensitiveRef.current,
		) => {
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}

			searchTimerRef.current = setTimeout(() => {
				performSearch(searchQuery, isCaseSensitive);
			}, SEARCH_DEBOUNCE_MS);
		},
		[performSearch],
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
		clearSearchIndexCache();
	}, [clearHighlights, clearSearchIndexCache]);

	useEffect(() => {
		if (!isSearchOpen) return;

		scheduleSearch(query, caseSensitive);

		return () => {
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, [caseSensitive, isSearchOpen, query, scheduleSearch]);

	useEffect(() => {
		if (!isSearchOpen) return;

		const container = containerRef.current;
		if (!container) return;

		let frameId = 0;
		const observedTargets = new Set<Node>();
		const observer = new MutationObserver(() => {
			cancelAnimationFrame(frameId);
			frameId = requestAnimationFrame(() => {
				clearSearchIndexCache();
				observeTargets();
				scheduleSearch();
			});
		});
		const observeTargets = () => {
			const targets = new Set<Node>([container]);

			for (const searchRoot of getResolvedSearchRoots()) {
				const rootNode = searchRoot.getRootNode();
				targets.add(rootNode instanceof ShadowRoot ? rootNode : searchRoot);
			}

			for (const target of targets) {
				if (observedTargets.has(target)) {
					continue;
				}

				observer.observe(target, {
					characterData: true,
					childList: true,
					subtree: true,
				});
				observedTargets.add(target);
			}
		};

		observeTargets();

		return () => {
			cancelAnimationFrame(frameId);
			observer.disconnect();
		};
	}, [
		clearSearchIndexCache,
		containerRef,
		getResolvedSearchRoots,
		isSearchOpen,
		scheduleSearch,
	]);

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
		clearSearchIndexCache();
	}, [isSearchOpen, clearHighlights, clearSearchIndexCache]);

	useEffect(() => {
		return () => {
			clearHighlights();
			clearSearchIndexCache();
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
			for (const styleElement of highlightStyleElementsRef.current.values()) {
				styleElement.remove();
			}
			highlightStyleElementsRef.current.clear();
		};
	}, [clearHighlights, clearSearchIndexCache]);

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
