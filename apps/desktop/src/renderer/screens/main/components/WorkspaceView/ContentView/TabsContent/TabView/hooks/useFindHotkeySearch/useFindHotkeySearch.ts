import type { RefObject } from "react";
import { useEffect } from "react";
import { type HotkeyId, useHotkey } from "renderer/hotkeys";
import { type UseTextSearchReturn, useTextSearch } from "../useTextSearch";

export interface UseFindHotkeySearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	/** Hotkey that toggles the search bar (e.g. "FIND_IN_DIFF"). */
	hotkeyId: HotkeyId;
	/** Distinguishes this instance's CSS highlight registrations. */
	highlightPrefix: string;
	/**
	 * Whether the owning pane is active/focused. Gates the toggle hotkey and
	 * auto-closes the search bar when it becomes false.
	 */
	isActive: boolean;
	/** Optional restriction of the DOM subtrees that are searched. */
	getSearchRoots?: (container: HTMLDivElement) => Array<Node & ParentNode>;
	/**
	 * When this value changes, any open search is closed (e.g. the active file
	 * path) so stale match Ranges don't linger across content swaps.
	 */
	resetKey?: unknown;
}

/** The search controller surface exposed to a pane's search UI. */
export type FindHotkeySearchController = Omit<
	UseTextSearchReturn,
	"setIsSearchOpen"
>;

/**
 * Shared orchestration for a pane's Cmd+F text search: wires the DOM-highlight
 * {@link useTextSearch} engine to a toggle hotkey, closes the bar when the pane
 * goes inactive (or `resetKey` changes), and exposes the controller surface its
 * search UI needs. Consumers supply only what differs between panes — the
 * hotkey, the highlight namespace, the active predicate, and optional search
 * roots — instead of re-implementing the flow.
 */
export function useFindHotkeySearch({
	containerRef,
	hotkeyId,
	highlightPrefix,
	isActive,
	getSearchRoots,
	resetKey,
}: UseFindHotkeySearchOptions): FindHotkeySearchController {
	const textSearch = useTextSearch({
		containerRef,
		highlightPrefix,
		getSearchRoots,
	});

	const { isSearchOpen, setIsSearchOpen, closeSearch } = textSearch;

	useEffect(() => {
		if (!isActive && isSearchOpen) {
			closeSearch();
		}
	}, [isActive, isSearchOpen, closeSearch]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on resetKey change only
	useEffect(() => {
		if (isSearchOpen) {
			closeSearch();
		}
	}, [resetKey]);

	useHotkey(
		hotkeyId,
		() => {
			if (isSearchOpen) {
				closeSearch();
				return;
			}
			setIsSearchOpen(true);
		},
		{ enabled: isActive, preventDefault: true },
	);

	const { setIsSearchOpen: _setIsSearchOpen, ...controller } = textSearch;
	return controller;
}
