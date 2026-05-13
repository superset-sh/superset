import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { Terminal as XTerm } from "@xterm/xterm";
import { createTerminalImageAddonController } from "./terminal-image-addon-controller";
import { createTerminalWebglAddonController } from "./terminal-webgl-addon-controller";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
	enableImageAddon: () => void;
	disableImageAddon: () => void;
	enableWebglAddon: () => void;
	disableWebglAddon: () => void;
	dispose: () => void;
}

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function and addon instances.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	const imageAddonController = createTerminalImageAddonController(terminal);
	const webglAddonController = createTerminalWebglAddonController(terminal);

	terminal.loadAddon(new ClipboardAddon());

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

	const searchAddon = new SearchAddon();
	terminal.loadAddon(searchAddon);

	const progressAddon = new ProgressAddon();
	terminal.loadAddon(progressAddon);

	return {
		searchAddon,
		progressAddon,
		enableImageAddon: imageAddonController.enable,
		disableImageAddon: imageAddonController.disable,
		enableWebglAddon: webglAddonController.enable,
		disableWebglAddon: webglAddonController.disable,
		dispose: () => {
			imageAddonController.dispose();
			webglAddonController.dispose();
		},
	};
}
