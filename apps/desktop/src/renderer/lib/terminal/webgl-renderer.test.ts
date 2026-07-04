import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	createWebglRendererController,
	type WebglAddonLike,
	type WebglFallbackReason,
} from "./webgl-renderer";

// Capture rAF callbacks so tests control frame timing deterministically.
let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;

const originalRaf = globalThis.requestAnimationFrame;
const originalCancelRaf = globalThis.cancelAnimationFrame;

function fireFrame() {
	const callbacks = [...frameCallbacks.values()];
	frameCallbacks.clear();
	for (const callback of callbacks) {
		callback(performance.now());
	}
}

beforeEach(() => {
	frameCallbacks = new Map();
	nextFrameId = 1;
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
		const id = nextFrameId++;
		frameCallbacks.set(id, callback);
		return id;
	};
	globalThis.cancelAnimationFrame = (id: number) => {
		frameCallbacks.delete(id);
	};
});

afterEach(() => {
	globalThis.requestAnimationFrame = originalRaf;
	globalThis.cancelAnimationFrame = originalCancelRaf;
});

interface FakeAddon extends WebglAddonLike {
	disposeCount: number;
	loseContext: () => void;
}

function createFakeAddon(): FakeAddon {
	let contextLossListener: (() => void) | null = null;
	const addon: FakeAddon = {
		disposeCount: 0,
		activate() {},
		dispose() {
			addon.disposeCount++;
		},
		onContextLoss(listener: () => void) {
			contextLossListener = listener;
			return { dispose() {} };
		},
		loseContext() {
			contextLossListener?.();
		},
	};
	return addon;
}

function createHarness(options: { failLoad?: boolean } = {}) {
	const created: FakeAddon[] = [];
	const loaded: WebglAddonLike[] = [];
	const fallbacks: WebglFallbackReason[] = [];
	let refreshCount = 0;

	const terminal = {
		rows: 24,
		refresh() {
			refreshCount++;
		},
		loadAddon(addon: WebglAddonLike) {
			loaded.push(addon);
		},
	} as unknown as XTerm;

	const controller = createWebglRendererController(terminal, {
		createAddon: () => {
			if (options.failLoad) {
				throw new Error("no webgl");
			}
			const addon = createFakeAddon();
			created.push(addon);
			return addon;
		},
		onFallback: (reason) => fallbacks.push(reason),
	});

	return {
		controller,
		created,
		loaded,
		fallbacks,
		getRefreshCount: () => refreshCount,
	};
}

describe("createWebglRendererController", () => {
	test("acquire loads the addon on the next frame", () => {
		const { controller, created, loaded } = createHarness();

		controller.acquire();
		expect(created).toHaveLength(0);

		fireFrame();
		expect(created).toHaveLength(1);
		expect(loaded).toEqual([created[0] as WebglAddonLike]);
	});

	test("acquire is idempotent while pending and while active", () => {
		const { controller, created } = createHarness();

		controller.acquire();
		controller.acquire();
		fireFrame();
		controller.acquire();
		fireFrame();

		expect(created).toHaveLength(1);
	});

	test("release before the frame fires cancels the pending load", () => {
		const { controller, created } = createHarness();

		controller.acquire();
		controller.release();
		fireFrame();

		expect(created).toHaveLength(0);
	});

	test("release disposes the context; next acquire creates a fresh one", () => {
		const { controller, created } = createHarness();

		controller.acquire();
		fireFrame();
		controller.release();
		expect((created[0] as FakeAddon).disposeCount).toBe(1);

		controller.acquire();
		fireFrame();
		expect(created).toHaveLength(2);
	});

	test("context loss falls back for this terminal and retries on next acquire", () => {
		const { controller, created, fallbacks, getRefreshCount } = createHarness();

		controller.acquire();
		fireFrame();
		(created[0] as FakeAddon).loseContext();

		expect((created[0] as FakeAddon).disposeCount).toBe(1);
		expect(fallbacks).toEqual(["context-loss"]);
		expect(getRefreshCount()).toBe(1);

		controller.acquire();
		fireFrame();
		expect(created).toHaveLength(2);
	});

	test("load failure disables WebGL for this controller only, permanently", () => {
		const { controller, created, fallbacks } = createHarness({
			failLoad: true,
		});

		controller.acquire();
		fireFrame();
		expect(fallbacks).toEqual(["load-failed"]);

		controller.acquire();
		fireFrame();
		expect(created).toHaveLength(0);
		expect(fallbacks).toHaveLength(1);

		// Other controllers are unaffected — no shared latch.
		const other = createHarness();
		other.controller.acquire();
		fireFrame();
		expect(other.created).toHaveLength(1);
	});

	test("dispose releases the context and blocks further acquires", () => {
		const { controller, created } = createHarness();

		controller.acquire();
		fireFrame();
		controller.dispose();
		expect((created[0] as FakeAddon).disposeCount).toBe(1);

		controller.acquire();
		fireFrame();
		expect(created).toHaveLength(1);
	});
});
