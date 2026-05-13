import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";

const constructedOptions: unknown[] = [];
const disposedAddons: FakeImageAddon[] = [];

class FakeImageAddon {
	constructor(options: unknown) {
		constructedOptions.push(options);
	}

	dispose() {
		disposedAddons.push(this);
	}
}

mock.module("@xterm/addon-image", () => ({
	ImageAddon: FakeImageAddon,
}));

const { IMAGE_PROTOCOL_ADDON_OPTIONS, createTerminalImageAddonController } =
	await import("./terminal-image-addon-controller");

function makeTerminal(options: { throwOnLoad?: boolean } = {}) {
	const loadedAddons: FakeImageAddon[] = [];
	const loadAddon = mock((addon: FakeImageAddon) => {
		loadedAddons.push(addon);
		if (options.throwOnLoad) {
			throw new Error("load failed");
		}
	});

	return {
		loadedAddons,
		terminal: { loadAddon } as unknown as XTerm,
		loadAddon,
	};
}

beforeEach(() => {
	constructedOptions.length = 0;
	disposedAddons.length = 0;
});

describe("IMAGE_PROTOCOL_ADDON_OPTIONS", () => {
	it("does not enable eager-WASM image protocols", () => {
		expect(IMAGE_PROTOCOL_ADDON_OPTIONS.sixelSupport).toBe(false);
		expect(IMAGE_PROTOCOL_ADDON_OPTIONS.iipSupport).toBe(false);
		expect(IMAGE_PROTOCOL_ADDON_OPTIONS.kittySupport).toBe(true);
	});
});

describe("createTerminalImageAddonController", () => {
	it("loads the image addon only while enabled", () => {
		const { terminal, loadAddon, loadedAddons } = makeTerminal();
		const controller = createTerminalImageAddonController(terminal);

		controller.enable();
		controller.enable();

		expect(loadAddon).toHaveBeenCalledTimes(1);
		expect(constructedOptions).toEqual([IMAGE_PROTOCOL_ADDON_OPTIONS]);

		controller.disable();
		controller.disable();

		expect(disposedAddons).toEqual([loadedAddons[0]]);
	});

	it("disposes a partially loaded addon and stops retrying after load failure", () => {
		const warn = mock(() => {});
		const previousWarn = console.warn;
		console.warn = warn;
		try {
			const { terminal, loadAddon, loadedAddons } = makeTerminal({
				throwOnLoad: true,
			});
			const controller = createTerminalImageAddonController(terminal);

			controller.enable();
			controller.enable();

			expect(loadAddon).toHaveBeenCalledTimes(1);
			expect(disposedAddons).toEqual([loadedAddons[0]]);
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			console.warn = previousWarn;
		}
	});
});
