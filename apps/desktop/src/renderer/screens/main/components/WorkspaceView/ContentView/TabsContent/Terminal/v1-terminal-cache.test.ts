/**
 * Reproduction tests for issue #4010:
 * "Terminal intermittently renders English text as RTL-looking gibberish".
 *
 * Root cause: xterm uses the WebGL renderer with a glyph texture atlas.
 * On macOS the GPU compositor can drop or corrupt atlas pages without
 * firing `onContextLoss` — typically after extended usage, display sleep,
 * or repeated tab switches. The result is that some glyphs paint from
 * stale/garbage texture coordinates, surfacing as RTL-looking gibberish
 * even though the underlying buffer text is correct.
 *
 * `attachToContainer` previously only called `xterm.refresh()` after
 * reattach/resize, but `refresh` paints from the existing atlas — it
 * does not invalidate it. The fix exposes `clearTextureAtlas()` from
 * the WebGL addon and calls it before refresh on reattach (always) and
 * on resize (when dimensions change).
 *
 * These tests model the exact decision logic in `fitAndRefresh` and
 * `attachToContainer` to verify atlas invalidation happens at the
 * right moments. A real WebGL/xterm runtime is not available under
 * bun:test, so we exercise the call-ordering logic against mocks that
 * mirror the production code paths.
 */
import { describe, expect, test } from "bun:test";

interface MockEntry {
	cols: number;
	rows: number;
	lastCols: number;
	lastRows: number;
	clearAtlasCalls: number;
	refreshCalls: number;
	callOrder: string[];
	/** Dimensions the next fit() call should produce. */
	nextCols: number;
	nextRows: number;
	clearTextureAtlas: () => void;
	refresh: () => void;
	fit: () => void;
}

function makeEntry(cols = 80, rows = 24): MockEntry {
	const entry: MockEntry = {
		cols,
		rows,
		lastCols: cols,
		lastRows: rows,
		clearAtlasCalls: 0,
		refreshCalls: 0,
		callOrder: [],
		nextCols: cols,
		nextRows: rows,
		clearTextureAtlas: () => {
			entry.clearAtlasCalls++;
			entry.callOrder.push("clearTextureAtlas");
		},
		refresh: () => {
			entry.refreshCalls++;
			entry.callOrder.push("refresh");
		},
		fit: () => {
			entry.cols = entry.nextCols;
			entry.rows = entry.nextRows;
			entry.lastCols = entry.cols;
			entry.lastRows = entry.rows;
		},
	};
	return entry;
}

/**
 * Mirrors the post-fix `fitAndRefresh` from v1-terminal-cache.ts.
 * Calls `clearTextureAtlas` when forced (reattach) or when fit() changed
 * the terminal dimensions; always calls refresh afterwards.
 */
function fitAndRefresh(
	entry: MockEntry,
	options: { clearAtlas?: boolean } = {},
): boolean {
	const prevCols = entry.cols;
	const prevRows = entry.rows;
	entry.fit();

	const dimensionsChanged = entry.cols !== prevCols || entry.rows !== prevRows;
	if (options.clearAtlas || dimensionsChanged) {
		entry.clearTextureAtlas();
	}
	entry.refresh();
	return dimensionsChanged;
}

/** Mirrors `attachToContainer` — always forces an atlas clear on reattach. */
function attachToContainer(entry: MockEntry): void {
	fitAndRefresh(entry, { clearAtlas: true });
}

/** Mirrors the ResizeObserver callback — clears atlas only on dim change. */
function onResizeObserved(entry: MockEntry): boolean {
	return fitAndRefresh(entry);
}

describe("v1-terminal-cache atlas invalidation — issue #4010", () => {
	test("attach clears the WebGL texture atlas before refreshing", () => {
		const entry = makeEntry();

		attachToContainer(entry);

		expect(entry.clearAtlasCalls).toBe(1);
		expect(entry.refreshCalls).toBe(1);
		expect(entry.callOrder).toEqual(["clearTextureAtlas", "refresh"]);
	});

	test("attach clears atlas even when container size has not changed", () => {
		// Reattach scenario where the container is the same size as before:
		// previously the corruption would leak through because refresh paints
		// from the existing (corrupt) atlas. The fix forces a clear regardless.
		const entry = makeEntry(80, 24);
		entry.nextCols = 80;
		entry.nextRows = 24;

		attachToContainer(entry);

		expect(entry.clearAtlasCalls).toBe(1);
		expect(entry.refreshCalls).toBe(1);
	});

	test("multiple reattach cycles each invalidate the atlas", () => {
		// Tab switching back and forth N times should clear the atlas N times,
		// since GPU corruption can accrue between switches.
		const entry = makeEntry();

		attachToContainer(entry);
		attachToContainer(entry);
		attachToContainer(entry);

		expect(entry.clearAtlasCalls).toBe(3);
		expect(entry.refreshCalls).toBe(3);
	});

	test("ResizeObserver clears atlas when dimensions change", () => {
		const entry = makeEntry(80, 24);
		entry.nextCols = 120;
		entry.nextRows = 36;

		const dimsChanged = onResizeObserved(entry);

		expect(dimsChanged).toBe(true);
		expect(entry.clearAtlasCalls).toBe(1);
		expect(entry.callOrder).toEqual(["clearTextureAtlas", "refresh"]);
	});

	test("ResizeObserver does NOT clear atlas on no-op resize", () => {
		// ResizeObserver fires spuriously on layout shifts that don't change
		// terminal cell dimensions. Clearing the atlas on every fire would
		// thrash the GPU; the production logic gates on dimension change.
		const entry = makeEntry(80, 24);
		entry.nextCols = 80;
		entry.nextRows = 24;

		const dimsChanged = onResizeObserved(entry);

		expect(dimsChanged).toBe(false);
		expect(entry.clearAtlasCalls).toBe(0);
		expect(entry.refreshCalls).toBe(1);
	});

	test("clearTextureAtlas runs before refresh so repaint sees fresh glyphs", () => {
		// Order matters: refresh paints from the atlas. Calling refresh
		// before clearTextureAtlas would still paint the corrupt frame.
		const entry = makeEntry();

		attachToContainer(entry);

		const clearIdx = entry.callOrder.indexOf("clearTextureAtlas");
		const refreshIdx = entry.callOrder.indexOf("refresh");
		expect(clearIdx).toBeGreaterThanOrEqual(0);
		expect(refreshIdx).toBeGreaterThan(clearIdx);
	});
});
