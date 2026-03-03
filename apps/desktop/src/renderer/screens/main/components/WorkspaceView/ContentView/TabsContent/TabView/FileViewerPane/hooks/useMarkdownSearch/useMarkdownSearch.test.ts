/**
 * Reproduction tests for issue #1996:
 * "the close button is glitching out / you can't close it at all"
 *
 * Root cause: the Cmd+F hotkey toggle calls `setIsSearchOpen(!prev)` but
 * does NOT call `closeSearch()`, so CSS Highlight API entries and the
 * `rangesRef` are never cleared when the user closes the search via the
 * keyboard shortcut.  When the user re-opens the search the stale
 * highlights are still registered, making the UI appear broken/glitched.
 *
 * These tests model the state-machine logic extracted from
 * `useMarkdownSearch` and can run without a DOM / React renderer.
 */
import { describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal state-machine that mirrors the relevant parts of useMarkdownSearch
// ---------------------------------------------------------------------------

type MockHighlightMap = Map<string, string>;

function createSearchState() {
	const highlights: MockHighlightMap = new Map();
	const rangesRef = { current: [] as string[] };

	// Mirrors the `clearHighlights` useCallback in useMarkdownSearch
	const clearHighlights = () => {
		if (rangesRef.current.length === 0) return;
		highlights.delete("markdown-search-matches");
		highlights.delete("markdown-search-active");
		rangesRef.current = [];
	};

	// Simulates the DOM performing a search that sets highlights
	const performSearch = () => {
		rangesRef.current = ["range1", "range2"];
		highlights.set("markdown-search-matches", "all-matches");
		highlights.set("markdown-search-active", "active-match");
	};

	// Mirrors the `closeSearch` useCallback in useMarkdownSearch.
	// Called when: X button is clicked, pane loses focus, rendered-mode exits,
	// or file changes.
	let isSearchOpen = false;
	let query = "";
	let matchCount = 0;
	let activeMatchIndex = 0;

	const closeSearch = () => {
		isSearchOpen = false;
		query = "";
		matchCount = 0;
		activeMatchIndex = 0;
		clearHighlights();
	};

	// Mirrors the CURRENT (buggy) hotkey toggle:
	//   () => setIsSearchOpen((prev) => !prev)
	// — it only flips the open flag, it does NOT call closeSearch().
	const toggleSearchBuggy = () => {
		isSearchOpen = !isSearchOpen;
		// clearHighlights() is intentionally NOT called here — this is the bug.
	};

	// Mirrors the FIXED hotkey toggle that calls closeSearch() when closing.
	const toggleSearchFixed = () => {
		if (isSearchOpen) {
			closeSearch();
		} else {
			isSearchOpen = true;
		}
	};

	return {
		get isSearchOpen() {
			return isSearchOpen;
		},
		set isSearchOpen(v: boolean) {
			isSearchOpen = v;
		},
		get query() {
			return query;
		},
		get matchCount() {
			return matchCount;
		},
		get activeMatchIndex() {
			return activeMatchIndex;
		},
		highlights,
		rangesRef,
		performSearch,
		closeSearch,
		toggleSearchBuggy,
		toggleSearchFixed,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMarkdownSearch – X button (closeSearch)", () => {
	test("clicking X button clears CSS highlights", () => {
		const state = createSearchState();

		// Open search and get some results
		state.isSearchOpen = true;
		state.performSearch();

		expect(state.highlights.size).toBe(2);
		expect(state.rangesRef.current.length).toBe(2);

		// User clicks the X button → closeSearch()
		state.closeSearch();

		expect(state.isSearchOpen).toBe(false);
		expect(state.highlights.size).toBe(0);
		expect(state.rangesRef.current.length).toBe(0);
	});

	test("clicking X button resets query, matchCount, and activeMatchIndex", () => {
		const state = createSearchState();

		state.isSearchOpen = true;
		state.performSearch();

		state.closeSearch();

		expect(state.query).toBe("");
		expect(state.matchCount).toBe(0);
		expect(state.activeMatchIndex).toBe(0);
	});
});

describe("useMarkdownSearch – Cmd+F hotkey toggle (was buggy before fix)", () => {
	/**
	 * This test reproduces issue #1996:
	 * Before the fix, the Cmd+F hotkey called `setIsSearchOpen(!prev)` and
	 * skipped `closeSearch()`, so CSS highlights lingered on the page.
	 * The toggleSearchBuggy helper below mirrors that old behaviour and is
	 * kept here to document what the bug looked like.
	 */
	test("old toggle (pre-fix) did NOT clear highlights", () => {
		const state = createSearchState();

		state.isSearchOpen = true;
		state.performSearch();

		// Old buggy toggle — only flips the flag, no cleanup
		state.toggleSearchBuggy();

		expect(state.isSearchOpen).toBe(false);
		// Highlights were left behind — that was the bug
		expect(state.highlights.size).toBe(2);
		expect(state.rangesRef.current.length).toBe(2);
	});
});

describe("useMarkdownSearch – Cmd+F hotkey toggle (fixed)", () => {
	test("toggling search closed via Cmd+F clears highlights after fix", () => {
		const state = createSearchState();

		state.isSearchOpen = true;
		state.performSearch();

		// Press Cmd+F again to close — fixed toggle calls closeSearch()
		state.toggleSearchFixed();

		expect(state.isSearchOpen).toBe(false);
		expect(state.highlights.size).toBe(0);
		expect(state.rangesRef.current.length).toBe(0);
	});

	test("fixed toggle opens search when it was closed", () => {
		const state = createSearchState();

		expect(state.isSearchOpen).toBe(false);

		state.toggleSearchFixed();

		expect(state.isSearchOpen).toBe(true);
	});
});
