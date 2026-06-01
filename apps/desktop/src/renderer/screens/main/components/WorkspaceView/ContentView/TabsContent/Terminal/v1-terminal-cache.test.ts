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
		// Mirrors `CachedTerminal.pendingResizeChange`: lives on the entry so the
		// signal survives both rAF cancellation and a detach/reattach cycle.
		pendingChange: false,
	};

	// Model rAF faithfully: ids are stable and cancel removes the pending
	// callback, so back-to-back events reproduce production's "last rAF wins"
	// behaviour rather than queueing every callback.
	const pendingRafs = new Map<number, () => void>();
	let nextRafId = 0;
	const requestAnimationFrame = (cb: () => void): number => {
		const id = ++nextRafId;
		pendingRafs.set(id, cb);
		return id;
	};
	const cancelAnimationFrame = (id: number) => {
		pendingRafs.delete(id);
	};

	const fitAndRefresh = (): boolean => {
		const width = state.settled ? opts.settledWidth : opts.staleWidth;
		const nextCols = width / CELL_WIDTH;
		const changed = nextCols !== state.cols;
		state.cols = nextCols;
		return changed;
	};

	// Mirrors the production ResizeObserver callback. `state.pendingChange` lives
	// on the entry so a dimension change survives rAF cancellation by a later
	// event (otherwise the backend notification would be lost).
	const onResizeEvent = () => {
		if (fitAndRefresh()) state.pendingChange = true;
		if (state.resizeRafId !== null) cancelAnimationFrame(state.resizeRafId);
		state.resizeRafId = requestAnimationFrame(() => {
			state.resizeRafId = null;
			state.settled = true;
			if (fitAndRefresh()) state.pendingChange = true;
			if (state.pendingChange) {
				state.pendingChange = false;
				state.onResizeCalls++;
			}
		});
	};

	// Mirrors detachFromContainer: cancels the pending rAF but deliberately
	// preserves `pendingChange` so reattach can flush it.
	const detach = () => {
		if (state.resizeRafId !== null) {
			cancelAnimationFrame(state.resizeRafId);
			state.resizeRafId = null;
		}
	};

	// Mirrors attachToContainer's reattach flush.
	const reattach = () => {
		if (fitAndRefresh()) state.pendingChange = true;
		if (state.pendingChange) {
			state.pendingChange = false;
			state.onResizeCalls++;
		}
	};

	const flushFrame = () => {
		const cbs = [...pendingRafs.values()];
		pendingRafs.clear();
		for (const cb of cbs) cb();
	};

	return { state, onResizeEvent, detach, reattach, flushFrame };
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

	it("collapses rapid back-to-back events into a single deferred refit", () => {
		// Two events arrive before a frame is flushed. The second must cancel
		// the first's pending rAF so only one deferred refit (and one backend
		// notification) runs — guarding the last-rAF-wins invariant.
		const h = makeHarness({ staleWidth: 600, settledWidth: 1200 });

		h.onResizeEvent();
		h.onResizeEvent();

		h.flushFrame();
		expect(h.state.cols).toBe(120);
		expect(h.state.onResizeCalls).toBe(1);
		expect(h.state.resizeRafId).toBeNull();
	});

	it("does not drop a dimension change when a later event cancels its rAF", () => {
		// Regression for #5022 (cubic P1): event 1's synchronous fit changes
		// dims, event 2's fit sees no further change and cancels event 1's
		// pending rAF, and the deferred fit also sees no change. The backend
		// must STILL be notified — the change from event 1 must not be lost.
		const h = makeHarness({ staleWidth: 800, settledWidth: 800 });
		h.state.cols = 120; // backend/xterm currently at the wide width

		h.onResizeEvent(); // sync fit: 120 -> 80 (changed)
		h.onResizeEvent(); // sync fit: 80 -> 80 (no change), cancels prior rAF

		h.flushFrame(); // deferred fit: 80 -> 80 (no change)
		expect(h.state.cols).toBe(80);
		expect(h.state.onResizeCalls).toBe(1);
	});

	it("flushes a pending resize on reattach when a detach cancelled its rAF", () => {
		// Regression for #5022 (CodeRabbit Major): the synchronous fit changed
		// dims (xterm adopted the new size) but a tab switch detached and
		// cancelled the deferred rAF before onResize fired. On reattach — with
		// the container unchanged so the reattach fit reports no change — the
		// backend must STILL be reconciled from the preserved pending signal.
		const h = makeHarness({ staleWidth: 800, settledWidth: 800 });
		h.state.cols = 120; // backend/xterm currently at the wide width

		h.onResizeEvent(); // sync fit: 120 -> 80 (changed), rAF scheduled
		expect(h.state.cols).toBe(80);
		expect(h.state.onResizeCalls).toBe(0); // not delivered yet

		h.detach(); // cancels the rAF; pendingChange preserved
		expect(h.state.onResizeCalls).toBe(0);

		h.reattach(); // container unchanged -> fit no-op, but pending flushes
		expect(h.state.onResizeCalls).toBe(1);
		expect(h.state.pendingChange).toBe(false);
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
