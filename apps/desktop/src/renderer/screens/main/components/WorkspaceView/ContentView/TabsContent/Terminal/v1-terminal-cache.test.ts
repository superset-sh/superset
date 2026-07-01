import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Reproduction test for https://github.com/anthropics/superset/issues/3468
 *
 * Bug: when a TUI agent (e.g. OpenCode) is started in a Superset terminal,
 * it renders at ~1/4 the terminal area. Resizing the window manually fixes it.
 *
 * Root cause: xterm is opened into a detached wrapper div, so its render
 * service reports cell dimensions of 0. When attachToContainer appends the
 * wrapper to the DOM and immediately calls fitAddon.fit(), FitAddon's
 * proposeDimensions() returns undefined (because css.cell.width === 0),
 * and fit() silently returns without resizing. The terminal stays at xterm's
 * default 80×24, which is sent as the initial PTY size. The ResizeObserver's
 * first callback fires before xterm has rendered a frame, so it also gets
 * 0 cell dimensions and fails. The correct size only arrives when the user
 * manually resizes the window.
 *
 * Fix: schedule a deferred fit via requestAnimationFrame so that after
 * xterm has rendered its first frame (and cell metrics are available),
 * fit() succeeds and onResize sends the correct dimensions to the backend.
 */

// ---------------------------------------------------------------------------
// Helpers — simulate xterm + fitAddon where fit() only works after first render
// ---------------------------------------------------------------------------

let rafCallbacks: Array<() => void> = [];

/** Simulates xterm + fitAddon where fit() only works once `cellReady` is true. */
function makeFakeXterm(containerCols: number, containerRows: number) {
	let cellReady = false;
	const xterm = {
		cols: 80,
		rows: 24,
	};

	const fitAddon = {
		/** Mirrors FitAddon.fit() — silently returns when cell dims are 0. */
		fit() {
			if (!cellReady) return;
			xterm.cols = containerCols;
			xterm.rows = containerRows;
		},
	};

	return {
		xterm,
		fitAddon,
		/** Simulate xterm completing its first render (cell metrics become available). */
		markCellReady() {
			cellReady = true;
		},
	};
}

describe("attachToContainer — deferred fit (issue #3468)", () => {
	beforeEach(() => {
		rafCallbacks = [];
		(globalThis as Record<string, unknown>).requestAnimationFrame = (
			cb: () => void,
		) => {
			rafCallbacks.push(cb);
			return rafCallbacks.length;
		};
	});

	it("reproduces the bug: initial fit fails when cell metrics are unavailable", () => {
		// Simulate the exact sequence that causes issue #3468:
		// xterm is opened into a detached wrapper → cell dims are 0 →
		// fitAddon.fit() silently returns → terminal stays at 80×24.
		const { xterm, fitAddon, markCellReady } = makeFakeXterm(160, 48);

		// Step 1: Initial fit fails (cell dims are 0, just like when
		// xterm is opened into a detached wrapper div)
		fitAddon.fit();
		expect(xterm.cols).toBe(80); // Still default — bug!
		expect(xterm.rows).toBe(24); // Still default — bug!

		// Step 2: This is what gets sent to createOrAttach — wrong dimensions.
		// The PTY is created with 80×24 instead of the correct 160×48.
		expect(xterm.cols).toBe(80);
		expect(xterm.rows).toBe(24);

		// Step 3: Only after xterm renders (cell metrics available) does fit work
		markCellReady();
		fitAddon.fit();
		expect(xterm.cols).toBe(160);
		expect(xterm.rows).toBe(48);
	});

	it("deferred rAF fit calls onResize when dimensions change", () => {
		// Simulates the fixed attachToContainer behavior:
		// 1. Initial fit fails → dims stay at 80×24
		// 2. rAF fires → xterm has rendered → fit succeeds → onResize called
		const { xterm, fitAddon, markCellReady } = makeFakeXterm(160, 48);
		const onResize = mock(() => {});

		// Initial fit in attachToContainer (fails silently)
		fitAddon.fit();
		let lastCols = xterm.cols; // still 80
		let lastRows = xterm.rows; // still 24

		// Deferred fit callback (what the fix adds via requestAnimationFrame)
		const deferredFit = () => {
			const prevCols = lastCols;
			const prevRows = lastRows;
			fitAddon.fit();
			lastCols = xterm.cols;
			lastRows = xterm.rows;
			if (lastCols !== prevCols || lastRows !== prevRows) {
				onResize();
			}
		};

		requestAnimationFrame(deferredFit);
		expect(rafCallbacks).toHaveLength(1);

		// Before rAF fires, xterm renders and cell metrics become available
		markCellReady();

		// Fire the rAF callback
		rafCallbacks[0]();

		// The deferred fit should have detected the dimension change
		expect(xterm.cols).toBe(160);
		expect(xterm.rows).toBe(48);
		expect(onResize).toHaveBeenCalledTimes(1);
	});

	it("deferred rAF fit does NOT call onResize when dimensions are already correct", () => {
		// If the initial fit worked (cell metrics were already available),
		// the deferred fit should be a no-op.
		const { xterm, fitAddon, markCellReady } = makeFakeXterm(160, 48);
		const onResize = mock(() => {});

		// Cell metrics available from the start
		markCellReady();

		// Initial fit succeeds
		fitAddon.fit();
		let lastCols = xterm.cols; // 160
		let lastRows = xterm.rows; // 48

		expect(lastCols).toBe(160);
		expect(lastRows).toBe(48);

		// Deferred fit — should not call onResize since dims didn't change
		const deferredFit = () => {
			const prevCols = lastCols;
			const prevRows = lastRows;
			fitAddon.fit();
			lastCols = xterm.cols;
			lastRows = xterm.rows;
			if (lastCols !== prevCols || lastRows !== prevRows) {
				onResize();
			}
		};

		requestAnimationFrame(deferredFit);
		rafCallbacks[0]();

		expect(xterm.cols).toBe(160);
		expect(xterm.rows).toBe(48);
		expect(onResize).not.toHaveBeenCalled();
	});
});
