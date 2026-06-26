/**
 * Reproduction + fix for #5021 — "Terminal stays narrow after window grows
 * back (shrink → grow leaves text at half width)".
 *
 * Root cause: the live (v1) terminal's ResizeObserver ran a single synchronous
 * `fitAddon.fit()` per event. `fit()` computes `cols = floor(parentWidth /
 * cellWidth)` from the container's computed width at call time. A maximize /
 * fullscreen is effectively one large grow event: the lone synchronous fit can
 * read intermediate/stale geometry and latch a too-small `cols`, and because
 * the observed container is already at its final width no further
 * ResizeObserver event fires to correct it — so the terminal stays narrow.
 *
 * Fix: `performResizeFit` fits immediately (snappy live-drag shrink) and then
 * schedules a single next-frame re-fit that reads settled geometry, cancelling
 * any pending frame on detach/dispose.
 *
 * These tests model the geometry directly with a fake terminal whose
 * `fitAddon.fit()` derives `cols`/`rows` from the container's current size, and
 * a controllable `requestAnimationFrame` so we can flush the deferred fit.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	type CachedTerminal,
	fitAndRefresh,
	performResizeFit,
} from "./v1-terminal-cache";

const CELL_WIDTH = 10;
const CELL_HEIGHT = 20;

interface FakeContainer {
	clientWidth: number;
	clientHeight: number;
}

function makeEntry(): {
	entry: CachedTerminal;
	container: FakeContainer;
} {
	const container: FakeContainer = { clientWidth: 0, clientHeight: 0 };

	const xterm = {
		cols: 0,
		rows: 0,
		buffer: { active: { viewportY: 0, baseY: 0 } },
		scrollToBottom() {},
		scrollToLine(_y: number) {},
		refresh(_start: number, _end: number) {},
	};

	const fitAddon = {
		// Mirror FitAddon.fit(): derive dimensions from the parent's CURRENT
		// computed size. Reading `container` live is exactly what makes a
		// synchronous fit on stale geometry latch the wrong `cols`.
		fit() {
			xterm.cols = Math.floor(container.clientWidth / CELL_WIDTH);
			xterm.rows = Math.floor(container.clientHeight / CELL_HEIGHT);
		},
	};

	const entry = {
		xterm,
		fitAddon,
		lastCols: 0,
		lastRows: 0,
		pendingResizeRaf: null,
		container,
	} as unknown as CachedTerminal;

	return { entry, container };
}

// --- Controllable requestAnimationFrame -----------------------------------

let rafQueue: Map<number, FrameRequestCallback>;
let rafSeq: number;
let realRaf: typeof globalThis.requestAnimationFrame | undefined;
let realCancelRaf: typeof globalThis.cancelAnimationFrame | undefined;

function flushFrame(): void {
	const callbacks = [...rafQueue.values()];
	rafQueue.clear();
	for (const cb of callbacks) cb(0);
}

beforeEach(() => {
	rafQueue = new Map();
	rafSeq = 0;
	realRaf = globalThis.requestAnimationFrame;
	realCancelRaf = globalThis.cancelAnimationFrame;
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		const id = ++rafSeq;
		rafQueue.set(id, cb);
		return id;
	}) as typeof globalThis.requestAnimationFrame;
	globalThis.cancelAnimationFrame = ((id: number) => {
		rafQueue.delete(id);
	}) as typeof globalThis.cancelAnimationFrame;
});

afterEach(() => {
	globalThis.requestAnimationFrame =
		realRaf as typeof globalThis.requestAnimationFrame;
	globalThis.cancelAnimationFrame =
		realCancelRaf as typeof globalThis.cancelAnimationFrame;
});

describe("v1 terminal resize fit — #5021", () => {
	const NARROW = 800; // 80 cols
	const FULL = 1600; // 160 cols
	const HEIGHT = 600; // 30 rows

	test("REPRODUCTION: a lone synchronous fit on stale geometry stays narrow", () => {
		const { entry, container } = makeEntry();

		// The single grow event fires while layout has not flushed yet, so the
		// container still reports the old narrow width.
		container.clientWidth = NARROW;
		container.clientHeight = HEIGHT;
		fitAndRefresh(entry);
		expect(entry.xterm.cols).toBe(80);

		// Layout now settles to full width. Since the container is already at
		// its final size, no further ResizeObserver event fires — with only a
		// synchronous fit, nothing re-reads the geometry and the terminal is
		// stuck at the narrow width. This is the reported bug.
		container.clientWidth = FULL;
		expect(entry.xterm.cols).toBe(80);
	});

	test("FIX: performResizeFit re-fits next frame and recovers full width", () => {
		const { entry, container } = makeEntry();

		// Synchronous portion reads stale narrow geometry...
		container.clientWidth = NARROW;
		container.clientHeight = HEIGHT;
		performResizeFit(entry);
		expect(entry.xterm.cols).toBe(80); // immediate fit latched narrow

		// ...layout flushes to full width before the next frame.
		container.clientWidth = FULL;

		flushFrame(); // deferred fit runs
		expect(entry.xterm.cols).toBe(160); // recovered full width
		expect(entry.lastCols).toBe(160);
		expect(entry.pendingResizeRaf).toBeNull();
	});

	test("notifies onResize when the deferred fit changes dimensions", () => {
		const { entry, container } = makeEntry();
		let resizeCalls = 0;

		container.clientWidth = NARROW;
		container.clientHeight = HEIGHT;
		performResizeFit(entry, () => {
			resizeCalls++;
		});
		expect(resizeCalls).toBe(1); // immediate fit (0 -> 80)

		container.clientWidth = FULL;
		flushFrame();
		expect(resizeCalls).toBe(2); // deferred fit (80 -> 160)
	});

	test("coalesces: rapid ticks keep only one pending deferred fit", () => {
		const { entry, container } = makeEntry();
		container.clientHeight = HEIGHT;

		container.clientWidth = 400;
		performResizeFit(entry);
		const firstRaf = entry.pendingResizeRaf;

		container.clientWidth = NARROW;
		performResizeFit(entry);

		// The earlier frame was cancelled in favour of the latest one.
		expect(rafQueue.has(firstRaf as number)).toBe(false);
		expect(rafQueue.size).toBe(1);

		container.clientWidth = FULL;
		flushFrame();
		expect(entry.xterm.cols).toBe(160);
	});

	test("a deferred fit cancelled before its frame does not run", () => {
		const { entry, container } = makeEntry();

		container.clientWidth = NARROW;
		container.clientHeight = HEIGHT;
		performResizeFit(entry);
		expect(entry.pendingResizeRaf).not.toBeNull();

		// Simulate detach/dispose cancelling the pending frame.
		cancelAnimationFrame(entry.pendingResizeRaf as number);
		entry.pendingResizeRaf = null;

		container.clientWidth = FULL;
		flushFrame();

		// No deferred fit ran, so cols stays at the synchronous narrow value.
		expect(entry.xterm.cols).toBe(80);
	});
});
