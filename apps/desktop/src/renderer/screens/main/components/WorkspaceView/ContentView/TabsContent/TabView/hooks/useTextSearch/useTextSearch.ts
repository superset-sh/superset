import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
	const wasSearchOpenRef = useRef(false);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const highlightInstanceIdRef = useRef<number | null>(null);
	const highlightStyleElementsRef = useRef(
		new Map<HTMLHeadElement | ShadowRoot, HTMLStyleElement>(),
	);

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

			const styleContainers = new Set<HTMLHeadElement | ShadowRoot>();
			for (const root of searchRoots) {
				const rootNode = root.getRootNode();
				if (rootNode instanceof ShadowRoot) {
					styleContainers.add(rootNode);
					continue;
				}

				if (document.head) {
					styleContainers.add(document.head);
				}
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

			const normalizedQuery = isCaseSensitive
				? searchQuery
				: searchQuery.toLowerCase();

			const ranges: Range[] = [];
			for (const searchRoot of searchRoots) {
				const walker = document.createTreeWalker(
					searchRoot,
					NodeFilter.SHOW_TEXT,
				);
				const textNodes: Text[] = [];
				const offsets: number[] = [];
				let fullText = "";

				for (
					let node = walker.nextNode() as Text | null;
					node !== null;
					node = walker.nextNode() as Text | null
				) {
					const textContent = node.textContent;
					if (!textContent) continue;

					offsets.push(fullText.length);
					textNodes.push(node);
					fullText += textContent;
				}

				if (textNodes.length === 0) {
					continue;
				}

				const searchableText = isCaseSensitive
					? fullText
					: fullText.toLowerCase();
				let startIdx = 0;

				while (startIdx < searchableText.length) {
					const idx = searchableText.indexOf(normalizedQuery, startIdx);
					if (idx === -1) break;

					const matchEnd = idx + searchQuery.length;
					let startNodeIndex = -1;
					let endNodeIndex = -1;

					for (let index = 0; index < textNodes.length; index += 1) {
						const nodeStart = offsets[index];
						const nodeEnd =
							nodeStart + (textNodes[index]?.textContent?.length ?? 0);

						if (startNodeIndex === -1 && idx < nodeEnd) {
							startNodeIndex = index;
						}

						if (matchEnd <= nodeEnd) {
							endNodeIndex = index;
							break;
						}
					}

					if (startNodeIndex === -1 || endNodeIndex === -1) {
						startIdx = idx + 1;
						continue;
					}

					const startNode = textNodes[startNodeIndex];
					const endNode = textNodes[endNodeIndex];
					if (!startNode || !endNode) {
						startIdx = idx + 1;
						continue;
					}

					const range = new Range();
					range.setStart(startNode, idx - offsets[startNodeIndex]);
					range.setEnd(endNode, matchEnd - offsets[endNodeIndex]);
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
			ensureHighlightStyles,
			getResolvedSearchRoots,
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
			for (const styleElement of highlightStyleElementsRef.current.values()) {
				styleElement.remove();
			}
			highlightStyleElementsRef.current.clear();
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
