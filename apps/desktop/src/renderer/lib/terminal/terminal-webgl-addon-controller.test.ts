import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";

const disposedAddons: FakeWebglAddon[] = [];

class FakeWebglAddon {
	onContextLoss = mock((_callback: () => void) => {});

	dispose() {
		disposedAddons.push(this);
	}
}

mock.module("@xterm/addon-webgl", () => ({
	WebglAddon: FakeWebglAddon,
}));

const { loadTerminalWebglAddon, resetTerminalWebglAddonStateForTesting } =
	await import("./terminal-webgl-addon-controller");
const { isTerminalWebglCanvas, TERMINAL_WEBGL_CANVAS_ATTRIBUTE } = await import(
	"./terminal-webgl-canvas-registry"
);

function installImmediateAnimationFrames() {
	const mutableGlobal = globalThis as typeof globalThis & {
		requestAnimationFrame?: typeof requestAnimationFrame;
		cancelAnimationFrame?: typeof cancelAnimationFrame;
	};
	const previousRequestAnimationFrame = mutableGlobal.requestAnimationFrame;
	const previousCancelAnimationFrame = mutableGlobal.cancelAnimationFrame;

	let rafId = 0;
	mutableGlobal.requestAnimationFrame = ((callback: FrameRequestCallback) => {
		rafId += 1;
		callback(rafId);
		return rafId;
	}) as typeof requestAnimationFrame;
	mutableGlobal.cancelAnimationFrame = mock(() => {});

	return () => {
		if (previousRequestAnimationFrame) {
			mutableGlobal.requestAnimationFrame = previousRequestAnimationFrame;
		} else {
			Reflect.deleteProperty(mutableGlobal, "requestAnimationFrame");
		}
		if (previousCancelAnimationFrame) {
			mutableGlobal.cancelAnimationFrame = previousCancelAnimationFrame;
		} else {
			Reflect.deleteProperty(mutableGlobal, "cancelAnimationFrame");
		}
	};
}

function createFakeTerminal() {
	const webglCanvasAttributes = new Map<string, string>();
	const webglCanvasClasses = new Set<string>();
	const webglCanvas = {
		classList: {
			add: mock((className: string) => {
				webglCanvasClasses.add(className);
			}),
		},
		getAttribute: mock(
			(name: string) => webglCanvasAttributes.get(name) ?? null,
		),
		removeAttribute: mock((name: string) => {
			webglCanvasAttributes.delete(name);
		}),
		setAttribute: mock((name: string, value: string) => {
			webglCanvasAttributes.set(name, value);
		}),
	} as unknown as HTMLCanvasElement;
	const element = new EventTarget() as EventTarget & {
		querySelectorAll: <T extends Element = Element>(selector: string) => T[];
	};
	element.querySelectorAll = <T extends Element = Element>() => [
		webglCanvas as unknown as T,
	];

	const loadedAddons: FakeWebglAddon[] = [];
	const loadAddon = mock((addon: FakeWebglAddon) => {
		loadedAddons.push(addon);
	});
	const refresh = mock(() => {});

	return {
		loadedAddons,
		lossTarget: element,
		webglCanvas,
		webglCanvasAttributes,
		webglCanvasClasses,
		terminal: {
			element,
			loadAddon,
			refresh,
			rows: 10,
		} as unknown as XTerm,
		loadAddon,
		refresh,
	};
}

describe("loadTerminalWebglAddon", () => {
	beforeEach(() => {
		disposedAddons.length = 0;
		resetTerminalWebglAddonStateForTesting();
	});

	it("falls back to DOM on terminal WebGL context loss", async () => {
		const restoreAnimationFrames = installImmediateAnimationFrames();

		try {
			const {
				loadedAddons,
				lossTarget,
				terminal,
				loadAddon,
				refresh,
				webglCanvas,
				webglCanvasAttributes,
				webglCanvasClasses,
			} = createFakeTerminal();

			loadTerminalWebglAddon(terminal);

			expect(loadAddon).toHaveBeenCalledTimes(1);
			expect(loadedAddons).toHaveLength(1);
			expect(loadedAddons[0]?.onContextLoss).toHaveBeenCalledTimes(1);
			expect(isTerminalWebglCanvas(webglCanvas)).toBe(true);
			expect(webglCanvasClasses.has("ph-no-capture")).toBe(true);
			expect(webglCanvasAttributes.get("data-ph-no-capture")).toBe("true");
			expect(webglCanvasAttributes.get(TERMINAL_WEBGL_CANVAS_ATTRIBUTE)).toBe(
				"true",
			);

			const lossEvent = new Event("webglcontextlost", { cancelable: true });
			lossTarget.dispatchEvent(lossEvent);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(lossEvent.defaultPrevented).toBe(true);
			expect(disposedAddons).toEqual([loadedAddons[0]]);
			expect(isTerminalWebglCanvas(webglCanvas)).toBe(false);
			expect(refresh).toHaveBeenCalledWith(0, 9);

			loadTerminalWebglAddon(terminal);

			expect(loadAddon).toHaveBeenCalledTimes(1);
		} finally {
			restoreAnimationFrames();
		}
	});

	it("cancels pending WebGL setup when disposed before the next frame", async () => {
		const mutableGlobal = globalThis as typeof globalThis & {
			requestAnimationFrame?: typeof requestAnimationFrame;
			cancelAnimationFrame?: typeof cancelAnimationFrame;
		};
		const previousRequestAnimationFrame = mutableGlobal.requestAnimationFrame;
		const previousCancelAnimationFrame = mutableGlobal.cancelAnimationFrame;
		Reflect.deleteProperty(mutableGlobal, "requestAnimationFrame");
		Reflect.deleteProperty(mutableGlobal, "cancelAnimationFrame");

		try {
			const { terminal, loadAddon } = createFakeTerminal();
			const handle = loadTerminalWebglAddon(terminal);

			handle.dispose();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(loadAddon).toHaveBeenCalledTimes(0);
		} finally {
			if (previousRequestAnimationFrame) {
				mutableGlobal.requestAnimationFrame = previousRequestAnimationFrame;
			}
			if (previousCancelAnimationFrame) {
				mutableGlobal.cancelAnimationFrame = previousCancelAnimationFrame;
			}
		}
	});
});
