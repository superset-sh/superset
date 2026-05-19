import { describe, expect, it, mock } from "bun:test";

const imageAddonOptions: unknown[] = [];

class FakeImageAddon {
	constructor(options: unknown) {
		imageAddonOptions.push(options);
	}
}

mock.module("@xterm/addon-image", () => ({
	ImageAddon: FakeImageAddon,
}));

const { createTerminalImageAddon, TERMINAL_IMAGE_ADDON_OPTIONS } = await import(
	"./terminal-image-addon"
);

describe("createTerminalImageAddon", () => {
	it("bounds per-terminal image decoder memory", () => {
		imageAddonOptions.length = 0;

		const addon = createTerminalImageAddon();

		expect(addon).toBeInstanceOf(FakeImageAddon);
		expect(imageAddonOptions).toEqual([TERMINAL_IMAGE_ADDON_OPTIONS]);
		expect(TERMINAL_IMAGE_ADDON_OPTIONS).toMatchObject({
			iipSupport: true,
			kittySupport: true,
			pixelLimit: 1_048_576,
			sixelSupport: false,
			storageLimit: 16,
		});
	});
});
