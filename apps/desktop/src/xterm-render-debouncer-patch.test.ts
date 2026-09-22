import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Guards the RenderDebouncer hunk of the bun patch on @xterm/xterm
// (DESKTOP-27 / DESKTOP-CS, see patches/README.md). Unpatched, dispose()
// cancels the pending frame but keeps the viewport/decoration refresh
// callbacks queued for it, and any refresh() on the disposed terminal re-arms
// a frame that runs them against a renderer slot dispose() already emptied:
// "Cannot read properties of undefined (reading 'dimensions')" from
// requestAnimationFrame. Terminal.dispose() does that to itself: it disposes
// the core before the addons, and an addon holding a character joiner (the
// ligatures addon) deregisters it on dispose, which calls refresh().
// patchedDependencies is keyed to an exact version, so a bump silently drops
// the patch while everything still builds. If this fails after a bump,
// regenerate the patch per patches/README.md; do NOT delete it.

// happy-dom over the preloaded plain-object document: Terminal.open() needs
// a real DOM. Globals are process-wide, so unregister in afterAll.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

// The DOM renderer measures glyphs through a 2d context happy-dom does not
// implement (it prefers OffscreenCanvas when present); widths only need to be
// finite for this test. The stub lives on happy-dom's prototypes, which outlive
// this file when another file registered the window first, so it is restored
// in afterAll rather than left for whichever test runs next.
const context2d = { font: "", measureText: () => ({ width: 8 }) };
const stubbedCanvases: Array<{
	prototype: object;
	descriptor: PropertyDescriptor | undefined;
}> = [];
for (const canvas of [
	globalThis.OffscreenCanvas,
	globalThis.HTMLCanvasElement,
]) {
	if (!canvas) continue;
	stubbedCanvases.push({
		prototype: canvas.prototype,
		descriptor: Object.getOwnPropertyDescriptor(canvas.prototype, "getContext"),
	});
	Object.defineProperty(canvas.prototype, "getContext", {
		configurable: true,
		writable: true,
		value: () => context2d,
	});
}

afterAll(async () => {
	for (const { prototype, descriptor } of stubbedCanvases) {
		if (descriptor) Object.defineProperty(prototype, "getContext", descriptor);
		else delete (prototype as { getContext?: unknown }).getContext;
	}
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const { Terminal } = await import("@xterm/xterm");

// The frame stubs below live on the process-wide window, which outlives this
// file when another suite registered happy-dom first (`alreadyRegistered`, so
// afterAll does not unregister). Leaving a queue that only this file drains
// would silently strand every later rAF, so restore after each test.
let restoreFrames: (() => void) | undefined;
afterEach(() => {
	restoreFrames?.();
	restoreFrames = undefined;
});

/** Deterministic frames: xterm schedules through the window it was opened in. */
function captureFrames() {
	const requestAnimationFrame = window.requestAnimationFrame;
	const cancelAnimationFrame = window.cancelAnimationFrame;
	restoreFrames = () => {
		window.requestAnimationFrame = requestAnimationFrame;
		window.cancelAnimationFrame = cancelAnimationFrame;
	};
	const frames = new Map<number, FrameRequestCallback>();
	let nextId = 1;
	window.requestAnimationFrame = (callback) => {
		const id = nextId++;
		frames.set(id, callback);
		return id;
	};
	window.cancelAnimationFrame = (id) => {
		frames.delete(id);
	};
	return {
		pending: () => frames.size,
		run() {
			const callbacks = [...frames.values()];
			frames.clear();
			for (const callback of callbacks) callback(0);
		},
	};
}

function openTerminal() {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const terminal = new Terminal({ cols: 40, rows: 10 });
	terminal.open(host);
	return terminal;
}

describe("@xterm/xterm RenderDebouncer dispose patch", () => {
	const libDir = dirname(require.resolve("@xterm/xterm"));
	for (const name of ["xterm.js", "xterm.mjs"] as const) {
		test(`${name} carries the patch`, () => {
			const src = readFileSync(join(libDir, name), "utf8");
			expect(src).toContain("this._isDisposed=!0,this._refreshCallbacks=[]");
			expect(src).toContain("if(this._isDisposed)return 0;");
		});
	}

	test("disposing a terminal with a joiner-holding addon and a queued viewport sync schedules nothing", () => {
		const frames = captureFrames();
		const terminal = openTerminal();
		// What @xterm/addon-ligatures does: register a joiner on activate and
		// deregister it on dispose, which xterm answers with a full refresh.
		let joinerId: number | undefined;
		terminal.loadAddon({
			activate(term) {
				joinerId = term.registerCharacterJoiner(() => []);
			},
			dispose() {
				if (joinerId !== undefined)
					terminal.deregisterCharacterJoiner(joinerId);
			},
		});
		frames.run();

		// bufferService.onResize -> Viewport.queueSync -> addRefreshCallback:
		// a viewport sync is now queued for the pending frame.
		terminal.resize(41, 10);
		expect(frames.pending()).toBe(1);

		// Core disposes first (frame cancelled, callbacks kept), then the addon
		// deregisters its joiner and refresh() re-arms the disposed debouncer.
		// Unpatched, that frame runs the stale viewport sync against
		// renderService.dimensions.
		terminal.dispose();
		expect(frames.pending()).toBe(0);
		expect(() => frames.run()).not.toThrow();
	});

	test("disposing from inside a render callback does not run the callbacks queued behind it", () => {
		const frames = captureFrames();
		const terminal = openTerminal();
		frames.run();

		terminal.onRender(() => terminal.dispose());
		terminal.resize(41, 10);
		terminal.write("x");
		terminal.refresh(0, 9);
		expect(frames.pending()).toBe(1);

		expect(() => frames.run()).not.toThrow();
	});
});
