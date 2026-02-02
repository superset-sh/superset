import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { registerRoute } from "lib/window-loader";
import type { WindowProps } from "shared/types";

function getDefaultWindowIcon(): string | undefined {
	if (process.platform !== "win32") {
		return undefined;
	}

	const candidates = app.isPackaged
		? [
				join(app.getAppPath(), "resources", "build", "icons", "icon.ico"),
				join(process.resourcesPath, "resources", "build", "icons", "icon.ico"),
			]
		: [
				join(app.getAppPath(), "src", "resources", "build", "icons", "icon.ico"),
			];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

export function createWindow({ id, ...settings }: WindowProps) {
	const icon = settings.icon ?? getDefaultWindowIcon();
	const window = new BrowserWindow({
		...settings,
		...(icon ? { icon } : {}),
	});

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
