import { join } from "node:path";
import { BrowserWindow, shell } from "electron";
import { registerRoute } from "lib/electron-router-dom";
import type { WindowProps } from "shared/types";

export function createWindow({ id, ...settings }: WindowProps) {
	const window = new BrowserWindow(settings);

	// Open external URLs in the system browser instead of Electron
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("http://") || url.startsWith("https://")) {
			shell.openExternal(url);
			return { action: "deny" };
		}
		return { action: "deny" };
	});

	registerRoute({
		id,
		browserWindow: window,
		htmlFile: join(__dirname, "../renderer/index.html"),
	});

	window.on("closed", window.destroy);

	return window;
}
