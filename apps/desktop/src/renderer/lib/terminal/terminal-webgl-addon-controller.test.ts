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

const {
	createTerminalWebglAddonController,
	isTerminalWebglCanvas,
	resetTerminalWebglAddonStateForTesting,
} = await import("./terminal-webgl-addon-controller");

const waitForWebglEnable = () =>
	new Promise((resolve) => setTimeout(resolve, 275));

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

describe("createTerminalWebglAddonController", () => {
	beforeEach(() => {
		disposedAddons.length = 0;
		resetTerminalWebglAddonStateForTesting();
	});

	it("falls back to DOM immediately on terminal WebGL context loss", async () => {
		const restoreAnimationFrames = installImmediateAnimationFrames();
		const previousInfo = console.info;
		console.info = mock(() => {});

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
			const controller = createTerminalWebglAddonController(terminal);

			controller.enable();
			await waitForWebglEnable();

			expect(loadAddon).toHaveBeenCalledTimes(1);
			expect(loadedAddons).toHaveLength(1);
			expect(loadedAddons[0]?.onContextLoss).toHaveBeenCalledTimes(1);
			expect(isTerminalWebglCanvas(webglCanvas)).toBe(true);
			expect(webglCanvasClasses.has("ph-no-capture")).toBe(true);
			expect(webglCanvasAttributes.get("data-ph-no-capture")).toBe("true");
			expect(webglCanvasAttributes.get("data-terminal-webgl-canvas")).toBe(
				"true",
			);

			const lossEvent = new Event("webglcontextlost", { cancelable: true });
			lossTarget.dispatchEvent(lossEvent);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(lossEvent.defaultPrevented).toBe(true);
			expect(console.info).toHaveBeenCalledTimes(1);
			expect(disposedAddons).toEqual([loadedAddons[0]]);
			expect(isTerminalWebglCanvas(webglCanvas)).toBe(false);
			expect(refresh).toHaveBeenCalledWith(0, 9);

			controller.enable();

			expect(loadAddon).toHaveBeenCalledTimes(1);
		} finally {
			console.info = previousInfo;
			restoreAnimationFrames();
		}
	});

	it("keeps the global DOM fallback when a pending loss is disabled", async () => {
		const restoreAnimationFrames = installImmediateAnimationFrames();
		const previousInfo = console.info;
		console.info = mock(() => {});

		try {
			const { loadedAddons, lossTarget, terminal, loadAddon, webglCanvas } =
				createFakeTerminal();
			const controller = createTerminalWebglAddonController(terminal);

			controller.enable();
			await waitForWebglEnable();

			expect(loadAddon).toHaveBeenCalledTimes(1);
			expect(isTerminalWebglCanvas(webglCanvas)).toBe(true);

			const lossEvent = new Event("webglcontextlost", { cancelable: true });
			lossTarget.dispatchEvent(lossEvent);
			controller.disable();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(lossEvent.defaultPrevented).toBe(true);
			expect(disposedAddons).toEqual([loadedAddons[0]]);
			expect(isTerminalWebglCanvas(webglCanvas)).toBe(false);

			controller.enable();

			expect(loadAddon).toHaveBeenCalledTimes(1);
		} finally {
			console.info = previousInfo;
			restoreAnimationFrames();
		}
	});

	it("cancels pending WebGL setup when disabled before the stable attach window", async () => {
		const restoreAnimationFrames = installImmediateAnimationFrames();

		try {
			const { terminal, loadAddon } = createFakeTerminal();
			const controller = createTerminalWebglAddonController(terminal);

			controller.enable();
			controller.disable();
			await waitForWebglEnable();

			expect(loadAddon).toHaveBeenCalledTimes(0);
		} finally {
			restoreAnimationFrames();
		}
	});
});
