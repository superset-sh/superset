import { type IImageAddonOptions, ImageAddon } from "@xterm/addon-image";

export const TERMINAL_IMAGE_ADDON_OPTIONS = {
	enableSizeReports: true,
	iipSizeLimit: 8_000_000,
	iipSupport: true,
	kittySizeLimit: 8_000_000,
	kittySupport: true,
	pixelLimit: 1_048_576,
	showPlaceholder: true,
	sixelSupport: false,
	storageLimit: 16,
} satisfies IImageAddonOptions;

export function createTerminalImageAddon(): ImageAddon {
	return new ImageAddon(TERMINAL_IMAGE_ADDON_OPTIONS);
}
