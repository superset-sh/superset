import {
	type CodeViewItem,
	DIFFS_TAG_NAME,
	type SelectionSide,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkey } from "renderer/hotkeys";
import { getDiffSearchRoots } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/utils/diffRendererRoots";
import type { UseTextSearchReturn } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";
import {
	findTextRanges,
	type HighlightStyleElementMap,
	type SearchRootIndexCache,
	syncHighlightStyles,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks/useTextSearch/utils/textSearchDom";
import { useSettings } from "renderer/stores/settings";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";
import {
	collectDiffSearchMatches,
	type DiffSearchMatch,
} from "./utils/collectDiffSearchMatches";

const SEARCH_DEBOUNCE_MS = 150;
let nextHighlightInstanceId = 0;

interface UseDiffPaneSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	codeViewRef: RefObject<CodeViewHandle<DiffAnnotationMetadata> | null>;
	items: CodeViewItem<DiffAnnotationMetadata>[];
	fileByItemId: ReadonlyMap<string, ChangesetFile>;
	collapsedSet: ReadonlySet<string>;
	setCollapsed: (changeKey: string, value: boolean) => void;
	isActive: boolean;
	paneId: string;
}

function supportsCustomHighlights(): boolean {
	return (
		typeof CSS !== "undefined" &&
		typeof Highlight !== "undefined" &&
		Boolean(CSS.highlights)
	);
}

function getShadowRootsWithin(element: HTMLElement): ShadowRoot[] {
	const roots: ShadowRoot[] = [];
	if (element.matches(DIFFS_TAG_NAME) && element.shadowRoot) {
		roots.push(element.shadowRoot);
	}
	for (const host of element.querySelectorAll<HTMLElement>(DIFFS_TAG_NAME)) {
		if (host.shadowRoot) {
			roots.push(host.shadowRoot);
		}
	}
	return roots;
}

function resolveRowSide(row: HTMLElement): SelectionSide {
	const lineType = row.dataset.lineType;
	if (lineType === "change-deletion") return "deletions";
	if (lineType === "change-addition") return "additions";
	const column = row.closest("[data-code]");
	return column instanceof HTMLElement && "deletions" in column.dataset
		? "deletions"
		: "additions";
}

function getRowForRangeBoundary(node: Node): Element | null {
	const element = node instanceof Element ? node : node.parentElement;
	return element?.closest("[data-line]") ?? null;
}

/** The DOM scan concatenates row text with no separator, so a query can match
 *  across two adjacent rows. The data-driven match list is strictly per-line,
 *  so painting such a range would show a highlight the counter never counts. */
function isWithinSingleRow(range: Range): boolean {
	return (
		getRowForRangeBoundary(range.startContainer) ===
		getRowForRangeBoundary(range.endContainer)
	);
}

/** Locate the rendered row for a match, if the virtualizer currently has it
 *  mounted. Returns null while the row is scrolled out of the render window. */
function findMatchRowElement(
	codeViewHandle: CodeViewHandle<DiffAnnotationMetadata> | null,
	match: DiffSearchMatch,
): HTMLElement | null {
	const instance = codeViewHandle?.getInstance();
	if (!instance) return null;
	const rendered = instance
		.getRenderedItems()
		.find((item) => item.id === match.itemId);
	if (!rendered) return null;

	for (const shadowRoot of getShadowRootsWithin(rendered.element)) {
		const rows = shadowRoot.querySelectorAll<HTMLElement>(
			`[data-line="${match.lineNumber}"]`,
		);
		for (const row of rows) {
			if (resolveRowSide(row) === match.side) return row;
		}
	}
	return null;
}

/**
 * Cmd+F search for the Changes pane. Matches are computed from the parsed
 * diff data (the CodeView virtualizes rows, so the DOM only ever holds the
 * viewport); highlights are painted onto whatever rows are mounted and
 * repainted as the virtualizer swaps rows in and out.
 */
export function useDiffPaneSearch({
	containerRef,
	codeViewRef,
	items,
	fileByItemId,
	collapsedSet,
	setCollapsed,
	isActive,
	paneId,
}: UseDiffPaneSearchOptions): UseTextSearchReturn {
	const expandUnchanged = useSettings((s) => s.expandUnchanged);

	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [activeMatchIndex, setActiveMatchIndex] = useState(0);

	const searchEntries = useMemo(() => {
		return items.flatMap((item) => {
			if (item.type !== "diff") return [];
			const file = fileByItemId.get(item.id);
			if (!file) return [];
			return [
				{
					itemId: item.id,
					changeKey: getChangesetFileKey(file),
					fileDiff: item.fileDiff,
				},
			];
		});
	}, [items, fileByItemId]);

	const matches = useMemo(() => {
		if (!isSearchOpen || !debouncedQuery) return [];
		return collectDiffSearchMatches(searchEntries, {
			query: debouncedQuery,
			caseSensitive,
			expandUnchanged,
		});
	}, [
		isSearchOpen,
		debouncedQuery,
		caseSensitive,
		searchEntries,
		expandUnchanged,
	]);

	const matchesRef = useRef(matches);
	matchesRef.current = matches;
	const activeMatchIndexRef = useRef(activeMatchIndex);
	activeMatchIndexRef.current = activeMatchIndex;
	const pendingScrollIndexRef = useRef<number | null>(null);

	const highlightInstanceIdRef = useRef<number | null>(null);
	if (highlightInstanceIdRef.current === null) {
		highlightInstanceIdRef.current = nextHighlightInstanceId;
		nextHighlightInstanceId += 1;
	}
	const highlightKeys = useMemo(() => {
		const id = highlightInstanceIdRef.current;
		return {
			matches: `changes-search-matches-${id}`,
			active: `changes-search-active-${id}`,
		};
	}, []);
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
	const highlightStyleElementsRef = useRef<HighlightStyleElementMap>(new Map());
	const searchIndexCacheRef = useRef<SearchRootIndexCache>(new WeakMap());

	const scrollToMatch = useCallback(
		(match: DiffSearchMatch) => {
			codeViewRef.current?.scrollTo({
				type: "line",
				id: match.itemId,
				lineNumber: match.lineNumber,
				side: match.side,
				align: "center",
				behavior: "instant",
			});
		},
		[codeViewRef],
	);

	const goToMatch = useCallback(
		(index: number) => {
			const match = matchesRef.current[index];
			if (!match) return;
			setActiveMatchIndex(index);
			if (collapsedSet.has(match.changeKey)) {
				pendingScrollIndexRef.current = index;
				setCollapsed(match.changeKey, false);
				return;
			}
			pendingScrollIndexRef.current = null;
			scrollToMatch(match);
		},
		[collapsedSet, setCollapsed, scrollToMatch],
	);

	// Finish a navigation that had to expand a collapsed file first: scroll
	// once the file's rows are part of the layout again.
	useEffect(() => {
		const index = pendingScrollIndexRef.current;
		if (index === null) return;
		const match = matches[index];
		if (!match) {
			pendingScrollIndexRef.current = null;
			return;
		}
		if (collapsedSet.has(match.changeKey)) return;
		pendingScrollIndexRef.current = null;
		scrollToMatch(match);
	}, [collapsedSet, matches, scrollToMatch]);

	const findNext = useCallback(() => {
		const total = matchesRef.current.length;
		if (total === 0) return;
		goToMatch((activeMatchIndexRef.current + 1) % total);
	}, [goToMatch]);

	const findPrevious = useCallback(() => {
		const total = matchesRef.current.length;
		if (total === 0) return;
		goToMatch((activeMatchIndexRef.current - 1 + total) % total);
	}, [goToMatch]);

	const closeSearch = useCallback(() => {
		setIsSearchOpen(false);
		setQuery("");
		setDebouncedQuery("");
		setActiveMatchIndex(0);
		pendingScrollIndexRef.current = null;
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(query);
		}, SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [query]);

	// Jump to the first match whenever the effective query changes. Later
	// match-list updates (diffs streaming in, files collapsing) must not yank
	// the viewport, so this keys off the query alone.
	// biome-ignore lint/correctness/useExhaustiveDependencies: jump only when the query changes
	useEffect(() => {
		setActiveMatchIndex(0);
		activeMatchIndexRef.current = 0;
		if (!debouncedQuery) return;
		const first = matchesRef.current[0];
		if (first) goToMatch(0);
	}, [debouncedQuery, caseSensitive]);

	// Keep the active index valid when the match list shrinks under it.
	useEffect(() => {
		if (matches.length > 0 && activeMatchIndex >= matches.length) {
			setActiveMatchIndex(0);
		}
	}, [matches, activeMatchIndex]);

	// Paint highlights over the mounted rows, and repaint as the virtualizer
	// mounts/unmounts rows while scrolling.
	useEffect(() => {
		if (!isSearchOpen || !debouncedQuery || !supportsCustomHighlights()) {
			return;
		}
		const container = containerRef.current;
		if (!container) return;

		const paint = () => {
			const searchRoots = getDiffSearchRoots(container);
			CSS.highlights.delete(highlightKeys.matches);
			CSS.highlights.delete(highlightKeys.active);
			if (searchRoots.length === 0) return;

			syncHighlightStyles(
				searchRoots,
				document,
				highlightStyleElementsRef.current,
				highlightStyles,
			);

			const ranges = findTextRanges({
				indexCache: searchIndexCacheRef.current,
				searchRoots,
				searchQuery: debouncedQuery,
				caseSensitive,
			});
			const allHighlight = new Highlight();
			for (const range of ranges) {
				if (!isWithinSingleRow(range)) continue;
				allHighlight.add(range);
			}
			CSS.highlights.set(highlightKeys.matches, allHighlight);

			const active = matches[activeMatchIndex];
			if (!active) return;
			const row = findMatchRowElement(codeViewRef.current, active);
			if (!row) return;
			const codeElement = row.querySelector("[data-code]") ?? row;
			const rowRanges = findTextRanges({
				indexCache: new WeakMap(),
				searchRoots: [codeElement],
				searchQuery: debouncedQuery,
				caseSensitive,
			});
			const activeRange = rowRanges[active.occurrence];
			if (activeRange) {
				CSS.highlights.set(highlightKeys.active, new Highlight(activeRange));
			}
		};

		paint();

		let frameId = 0;
		const observedTargets = new Set<Node>();
		const observer = new MutationObserver(() => {
			cancelAnimationFrame(frameId);
			frameId = requestAnimationFrame(() => {
				searchIndexCacheRef.current = new WeakMap();
				observeTargets();
				paint();
			});
		});
		const observeTargets = () => {
			const targets = new Set<Node>([container]);
			for (const searchRoot of getDiffSearchRoots(container)) {
				const rootNode = searchRoot.getRootNode();
				targets.add(rootNode instanceof ShadowRoot ? rootNode : searchRoot);
			}
			for (const target of targets) {
				if (observedTargets.has(target)) continue;
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
			CSS.highlights.delete(highlightKeys.matches);
			CSS.highlights.delete(highlightKeys.active);
		};
	}, [
		isSearchOpen,
		debouncedQuery,
		caseSensitive,
		matches,
		activeMatchIndex,
		containerRef,
		codeViewRef,
		highlightKeys,
		highlightStyles,
	]);

	// Remove injected ::highlight style elements when the pane unmounts.
	useEffect(() => {
		return () => {
			for (const styleElement of highlightStyleElementsRef.current.values()) {
				styleElement.remove();
			}
			highlightStyleElementsRef.current.clear();
		};
	}, []);

	useEffect(() => {
		if (!isActive && isSearchOpen) {
			closeSearch();
		}
	}, [isActive, isSearchOpen, closeSearch]);

	// Same-kind panes share one React instance across tab switches, so search
	// state must be discarded when the rendered pane identity changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on pane change only
	useEffect(() => {
		if (isSearchOpen) {
			closeSearch();
		}
	}, [paneId]);

	useHotkey(
		"FIND_IN_CHANGES",
		() => {
			if (isSearchOpen) {
				closeSearch();
				return;
			}
			setIsSearchOpen(true);
		},
		{ enabled: isActive, preventDefault: true },
	);

	return {
		isSearchOpen,
		setIsSearchOpen,
		query,
		caseSensitive,
		matchCount: matches.length,
		activeMatchIndex,
		setQuery,
		setCaseSensitive,
		findNext,
		findPrevious,
		closeSearch,
	};
}
