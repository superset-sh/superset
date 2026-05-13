import { ImageAddon } from "@xterm/addon-image";
import type { Terminal as XTerm } from "@xterm/xterm";

type ImageAddonOptions = NonNullable<
	ConstructorParameters<typeof ImageAddon>[0]
>;

export const IMAGE_PROTOCOL_ADDON_OPTIONS = {
	enableSizeReports: true,
	pixelLimit: 4 * 1024 * 1024,
	storageLimit: 16,
	showPlaceholder: true,
	// These protocols allocate WASM decoders when the addon is activated.
	// Keep retained/parked terminals cheap; Kitty allocates only per image stream.
	sixelSupport: false,
	sixelScrolling: true,
	sixelPaletteLimit: 256,
	sixelSizeLimit: 4 * 1024 * 1024,
	iipSupport: false,
	iipSizeLimit: 4 * 1024 * 1024,
	kittySupport: true,
	kittySizeLimit: 8 * 1024 * 1024,
} satisfies ImageAddonOptions;

export interface TerminalImageAddonController {
	enable: () => void;
	disable: () => void;
	dispose: () => void;
}

export function createTerminalImageAddonController(
	terminal: XTerm,
): TerminalImageAddonController {
	let imageAddon: ImageAddon | null = null;
	let loadFailed = false;

	const disable = () => {
		const addon = imageAddon;
		if (!addon) return;
		imageAddon = null;
		try {
			addon.dispose();
		} catch {}
	};

	return {
		enable: () => {
			if (imageAddon || loadFailed) return;

			let nextAddon: ImageAddon | null = null;
			try {
				nextAddon = new ImageAddon(IMAGE_PROTOCOL_ADDON_OPTIONS);
				terminal.loadAddon(nextAddon);
				imageAddon = nextAddon;
			} catch (error) {
				loadFailed = true;
				if (nextAddon) {
					try {
						nextAddon.dispose();
					} catch {}
				}
				console.warn("[Terminal] Disabled image protocol addon:", error);
			}
		},
		disable,
		dispose: disable,
	};
}
