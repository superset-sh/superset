import { join } from "node:path";
import { BrowserWindow } from "electron";
import { registerRoute } from "lib/electron-router-dom";
import type { WindowProps } from "shared/types";

export function createWindow({ id, ...settings }: WindowProps) {
	const window = new BrowserWindow(settings);

	registerRoute({
		id,
		browserWindow: window,
		htmlFile: join(__dirname, "../renderer/index.html"),
	});

	window.on("closed", window.destroy);

	return window;
}
