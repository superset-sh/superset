/**
 * Reproduction tests for issue #5021:
 * "Terminal stays narrow after the window grows back."
 *
 * Resize the Superset window to ~half the screen and the terminal reflows
 * correctly to the narrower width. Grow it back to full / maximize and the
 * terminal stays at the old narrow width — only the left half is used.
 *
 * Root cause: the v1 cache ResizeObserver ran a single SYNCHRONOUS
 * `fitAddon.fit()` per event. `fit()` computes `cols = floor(parentWidth /
 * cellWidth)` from the parent's computed width at call time. Shrinking is a
 * continuous drag (many events; the last lands after layout settles), but a
 * maximize / fullscreen is effectively one large grow event. The single
 * synchronous fit reads intermediate/stale geometry (layout not flushed, WebGL
 * cell metrics not refreshed) and latches a too-small `cols`. Because the
 * observed container is already at its final width, no further event fires to
 * correct it.
 *
 * Fix: fit immediately (snappy shrink) AND re-fit on the next animation frame
 * so a single-shot grow re-reads the settled geometry.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model of the deferred-refit ResizeObserver handler in
// v1-terminal-cache.ts `attachToContainer`. The "terminal" exposes a stale
// geometry on the synchronous read and the settled geometry on the next frame,
// mirroring how layout/cell metrics lag a single-shot grow event.
// ---------------------------------------------------------------------------

const CELL_WIDTH = 10;

function makeHarness(opts: {
	/** Width visible to the synchronous fit (intermediate, lags on grow). */
	staleWidth: number;
	/** Width visible once the next frame settles. */
	settledWidth: number;
}) {
	const state = {
		cols: opts.staleWidth / CELL_WIDTH,
		resizeRafId: null as number | null,
		// Switches from stale -> settled when the rAF callback runs.
		settled: false,
		onResizeCalls: 0,
	};

	const pendingRafs: Array<() => void> = [];
	const requestAnimationFrame = (cb: () => void): number => {
		pendingRafs.push(cb);
		return pendingRafs.length;
	};
	const cancelAnimationFrame = (_id: number) => {};

	const fitAndRefresh = (): boolean => {
		const width = state.settled ? opts.settledWidth : opts.staleWidth;
		const nextCols = width / CELL_WIDTH;
		const changed = nextCols !== state.cols;
		state.cols = nextCols;
		return changed;
	};

	// Mirrors the production ResizeObserver callback.
	const onResizeEvent = () => {
		const changedNow = fitAndRefresh();
		if (state.resizeRafId !== null) cancelAnimationFrame(state.resizeRafId);
		state.resizeRafId = requestAnimationFrame(() => {
			state.resizeRafId = null;
			state.settled = true;
			const changedLater = fitAndRefresh();
			if (changedNow || changedLater) state.onResizeCalls++;
		});
	};

	const flushFrame = () => {
		const cbs = pendingRafs.splice(0);
		for (const cb of cbs) cb();
	};

	return { state, onResizeEvent, flushFrame };
}

describe("v1-terminal-cache deferred resize refit (#5021)", () => {
	it("re-fits to full width after a single-shot grow whose sync read is stale", () => {
		// Window grows from half (600px) to full (1200px), but the synchronous
		// fit only sees the half width — the settled full width is visible next
		// frame.
		const h = makeHarness({ staleWidth: 600, settledWidth: 1200 });

		h.onResizeEvent();
		// Synchronous fit alone would leave the terminal stuck at 60 cols.
		expect(h.state.cols).toBe(60);

		h.flushFrame();
		// Deferred refit reads the settled width → full 120 cols.
		expect(h.state.cols).toBe(120);
		expect(h.state.onResizeCalls).toBe(1);
		expect(h.state.resizeRafId).toBeNull();
	});

	it("notifies the backend even when only the deferred fit changes dims", () => {
		// Sync read sees no change (still half), settled read grows.
		const h = makeHarness({ staleWidth: 600, settledWidth: 1200 });
		h.state.cols = 60; // already at the stale width

		h.onResizeEvent();
		expect(h.state.onResizeCalls).toBe(0); // not until the frame settles

		h.flushFrame();
		expect(h.state.cols).toBe(120);
		expect(h.state.onResizeCalls).toBe(1);
	});

	it("does not notify when neither the sync nor deferred fit changes dims", () => {
		const h = makeHarness({ staleWidth: 1200, settledWidth: 1200 });
		h.state.cols = 120;

		h.onResizeEvent();
		h.flushFrame();

		expect(h.state.cols).toBe(120);
		expect(h.state.onResizeCalls).toBe(0);
	});
});
