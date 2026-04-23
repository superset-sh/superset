import { describe, expect, mock, test } from "bun:test";
import {
	DebounceMs,
	type ResizeDebouncerCallbacks,
	StartDebouncingThreshold,
	TerminalResizeDebouncer,
} from "./resize-debouncer";

// Upstream VSCode (terminalResizeDebouncer.ts) ships without dedicated unit
// tests. These tests pin the documented behavior so a future vendor refresh
// surfaces any semantic drift.

interface Harness {
	debouncer: TerminalResizeDebouncer;
	cb: {
		isVisible: ReturnType<typeof mock>;
		getBufferLength: ReturnType<typeof mock>;
		resizeBoth: ReturnType<typeof mock>;
		resizeX: ReturnType<typeof mock>;
		resizeY: ReturnType<typeof mock>;
	};
}

function createHarness(opts: {
	visible?: boolean;
	bufferLength?: number;
	debounceMs?: number;
}): Harness {
	const cb = {
		isVisible: mock(() => opts.visible ?? true),
		getBufferLength: mock(() => opts.bufferLength ?? 1000),
		resizeBoth: mock(),
		resizeX: mock(),
		resizeY: mock(),
	};
	const debouncer = new TerminalResizeDebouncer(
		cb as unknown as ResizeDebouncerCallbacks,
		{ debounceMs: opts.debounceMs ?? 5 },
	);
	return { debouncer, cb };
}

function wait(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

describe("TerminalResizeDebouncer — immediate path", () => {
	test("resizes immediately when `immediate: true` regardless of buffer size", () => {
		const { debouncer, cb } = createHarness({ bufferLength: 100_000 });
		debouncer.resize(80, 24, true);
		expect(cb.resizeBoth).toHaveBeenCalledTimes(1);
		expect(cb.resizeBoth).toHaveBeenCalledWith(80, 24);
		expect(cb.resizeX).not.toHaveBeenCalled();
		expect(cb.resizeY).not.toHaveBeenCalled();
	});

	test("resizes immediately when buffer is below StartDebouncingThreshold", () => {
		const { debouncer, cb } = createHarness({
			bufferLength: StartDebouncingThreshold - 1,
		});
		debouncer.resize(80, 24, false);
		expect(cb.resizeBoth).toHaveBeenCalledWith(80, 24);
	});

	test("does not take immediate path at exactly StartDebouncingThreshold (strictly-less-than)", () => {
		// Upstream uses `< StartDebouncingThreshold`, not `<=`.
		const { debouncer, cb } = createHarness({
			bufferLength: StartDebouncingThreshold,
		});
		debouncer.resize(80, 24, false);
		expect(cb.resizeBoth).not.toHaveBeenCalled();
		expect(cb.resizeY).toHaveBeenCalledTimes(1);
		debouncer.dispose();
	});
});

describe("TerminalResizeDebouncer — visible large-buffer path", () => {
	test("applies Y immediately and debounces X", async () => {
		const { debouncer, cb } = createHarness({
			visible: true,
			bufferLength: 10_000,
			debounceMs: 5,
		});
		debouncer.resize(80, 24, false);
		expect(cb.resizeY).toHaveBeenCalledWith(24);
		expect(cb.resizeX).not.toHaveBeenCalled();
		expect(cb.resizeBoth).not.toHaveBeenCalled();
		await wait(20);
		expect(cb.resizeX).toHaveBeenCalledWith(80);
	});

	test("coalesces rapid X resizes to the last value", async () => {
		const { debouncer, cb } = createHarness({
			visible: true,
			bufferLength: 10_000,
			debounceMs: 10,
		});
		debouncer.resize(80, 24, false);
		debouncer.resize(90, 25, false);
		debouncer.resize(100, 26, false);
		// Each Y fires immediately — that's intentional (cheap).
		expect(cb.resizeY.mock.calls.map((c) => c[0])).toEqual([24, 25, 26]);
		expect(cb.resizeX).not.toHaveBeenCalled();
		await wait(25);
		// Only the last X fires.
		expect(cb.resizeX).toHaveBeenCalledTimes(1);
		expect(cb.resizeX).toHaveBeenCalledWith(100);
	});
});

describe("TerminalResizeDebouncer — hidden path", () => {
	test("schedules X and Y via idle callback when not visible", async () => {
		const { debouncer, cb } = createHarness({
			visible: false,
			bufferLength: 10_000,
		});
		debouncer.resize(80, 24, false);
		// Neither should fire synchronously.
		expect(cb.resizeBoth).not.toHaveBeenCalled();
		expect(cb.resizeX).not.toHaveBeenCalled();
		expect(cb.resizeY).not.toHaveBeenCalled();
		// After idle (setTimeout(0) fallback in node/bun), both fire.
		await wait(20);
		expect(cb.resizeX).toHaveBeenCalledWith(80);
		expect(cb.resizeY).toHaveBeenCalledWith(24);
	});

	test("coalesces multiple hidden resizes to latest values", async () => {
		const { debouncer, cb } = createHarness({
			visible: false,
			bufferLength: 10_000,
		});
		debouncer.resize(80, 24, false);
		debouncer.resize(90, 25, false);
		debouncer.resize(100, 26, false);
		await wait(20);
		// Upstream uses a MutableDisposable that refuses to re-schedule while
		// pending — so only the latest X/Y fire, once each.
		expect(cb.resizeX).toHaveBeenCalledTimes(1);
		expect(cb.resizeX).toHaveBeenCalledWith(100);
		expect(cb.resizeY).toHaveBeenCalledTimes(1);
		expect(cb.resizeY).toHaveBeenCalledWith(26);
	});
});

describe("TerminalResizeDebouncer — flush", () => {
	test("flush applies latest X and Y via resizeBoth when work is pending", async () => {
		const { debouncer, cb } = createHarness({
			visible: true,
			bufferLength: 10_000,
			debounceMs: 1000,
		});
		debouncer.resize(80, 24, false);
		debouncer.resize(100, 40, false);
		expect(cb.resizeX).not.toHaveBeenCalled();
		debouncer.flush();
		expect(cb.resizeBoth).toHaveBeenCalledTimes(1);
		expect(cb.resizeBoth).toHaveBeenCalledWith(100, 40);
		// Pending X should no longer fire after flush.
		await wait(20);
		expect(cb.resizeX).not.toHaveBeenCalled();
	});

	test("flush is a no-op when nothing is pending", () => {
		const { debouncer, cb } = createHarness({
			visible: true,
			bufferLength: 10_000,
		});
		debouncer.flush();
		expect(cb.resizeBoth).not.toHaveBeenCalled();
		expect(cb.resizeX).not.toHaveBeenCalled();
		expect(cb.resizeY).not.toHaveBeenCalled();
	});
});

describe("TerminalResizeDebouncer — dispose", () => {
	test("dispose cancels pending X debounce without firing", async () => {
		const { debouncer, cb } = createHarness({
			visible: true,
			bufferLength: 10_000,
			debounceMs: 10,
		});
		debouncer.resize(80, 24, false);
		debouncer.dispose();
		await wait(25);
		expect(cb.resizeX).not.toHaveBeenCalled();
	});

	test("dispose cancels pending idle jobs without firing", async () => {
		const { debouncer, cb } = createHarness({
			visible: false,
			bufferLength: 10_000,
		});
		debouncer.resize(80, 24, false);
		debouncer.dispose();
		await wait(20);
		expect(cb.resizeX).not.toHaveBeenCalled();
		expect(cb.resizeY).not.toHaveBeenCalled();
	});
});

describe("TerminalResizeDebouncer — path switching", () => {
	test("visible→hidden cancels the pending X debounce", async () => {
		const harness = createHarness({
			visible: true,
			bufferLength: 10_000,
			debounceMs: 10,
		});
		const { debouncer, cb } = harness;

		// 1. Visible resize schedules a debounced X with cols=80.
		debouncer.resize(80, 24, false);
		expect(cb.resizeX).not.toHaveBeenCalled();

		// 2. Terminal becomes hidden; a new resize enters the idle path with cols=90.
		cb.isVisible.mockImplementation(() => false);
		debouncer.resize(90, 25, false);

		// 3. Idle callback fires (setTimeout(0) fallback in node/bun) and applies 90.
		// The debounce timer, had it been left pending, would fire 10ms later
		// with the stale closure value 80 and revert us.
		await wait(30);

		// Only the latest (90) should have been applied — no revert to 80.
		expect(cb.resizeX.mock.calls).toEqual([[90]]);
	});

	test("hidden→visible cancels the pending idle X/Y jobs", async () => {
		const harness = createHarness({
			visible: false,
			bufferLength: 10_000,
			debounceMs: 10,
		});
		const { debouncer, cb } = harness;

		// 1. Hidden resize schedules idle X=80, Y=24.
		debouncer.resize(80, 24, false);
		expect(cb.resizeX).not.toHaveBeenCalled();
		expect(cb.resizeY).not.toHaveBeenCalled();

		// 2. Terminal becomes visible; new resize should apply Y immediately
		// and debounce X — without letting the stale idle jobs fire after.
		cb.isVisible.mockImplementation(() => true);
		debouncer.resize(90, 25, false);
		expect(cb.resizeY).toHaveBeenCalledTimes(1);
		expect(cb.resizeY).toHaveBeenCalledWith(25);

		// Wait past both idle and debounce.
		await wait(30);

		// Y fired exactly once (from the visible path) — no stale idle Y.
		expect(cb.resizeY.mock.calls).toEqual([[25]]);
		// X fired exactly once (from the debounce) — no stale idle X.
		expect(cb.resizeX.mock.calls).toEqual([[90]]);
	});
});

describe("Constants", () => {
	test("match upstream VSCode values", () => {
		expect(StartDebouncingThreshold).toBe(200);
		expect(DebounceMs).toBe(100);
	});
});
