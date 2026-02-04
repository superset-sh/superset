import { app, BrowserWindow, shell } from "electron";

import {
	installExtension,
	REACT_DEVELOPER_TOOLS,
} from "electron-extension-installer";
import { env } from "main/env.main";
import { PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	if (env.NODE_ENV === "development") {
		try {
			await installExtension([REACT_DEVELOPER_TOOLS], {
				loadExtensionOptions: {
					allowFileAccess: true,
				},
			});
		} catch {
			// DevTools installation can fail in CI/headless environments
		}
	}

	// Restore windows from previous session if available
	if (restoreWindows) {
		await restoreWindows();
	}

	// If no windows were restored, create a new one
	const existingWindows = BrowserWindow.getAllWindows();
	let window: BrowserWindow;
	if (existingWindows.length > 0) {
		window = existingWindows[0];
	} else {
		window = await createWindow();
	}

	app.on("activate", async () => {
		const windows = BrowserWindow.getAllWindows();

		if (!windows.length) {
			window = await createWindow();
		} else {
			for (window of windows.reverse()) {
				window.restore();
			}
		}
	});

	app.on("web-contents-created", (_, contents) =>
		contents.on("will-navigate", (event, url) => {
			// Always prevent in-app navigation for external URLs
			if (url.startsWith("http://") || url.startsWith("https://")) {
				event.preventDefault();
				shell.openExternal(url);
			}
		}),
	);

	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());
	app.on("before-quit", () => {});

	return window;
}

PLATFORM.IS_LINUX && app.disableHardwareAcceleration();

// macOS Sequoia+: occluded window throttling can corrupt GPU compositor layers
if (PLATFORM.IS_MAC) {
	app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

PLATFORM.IS_WINDOWS &&
	app.setAppUserModelId(
		env.NODE_ENV === "development" ? process.execPath : makeAppId(),
	);

app.commandLine.appendSwitch("force-color-profile", "srgb");
