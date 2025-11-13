import { app, BrowserWindow } from "electron";

import {
	installExtension,
	REACT_DEVELOPER_TOOLS,
} from "electron-extension-installer";
import terminalManager from "main/lib/terminal";
import { ENVIRONMENT, PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	if (ENVIRONMENT.IS_DEV) {
		try {
			await installExtension([REACT_DEVELOPER_TOOLS], {
				loadExtensionOptions: {
					allowFileAccess: true,
				},
			});
		} catch (error) {
			//   console.warn('Failed to install React DevTools extension:', error)
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
		contents.on(
			"will-navigate",
			(event, _) => !ENVIRONMENT.IS_DEV && event.preventDefault(),
		),
	);

	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());

	// Clean up terminal processes before app quits
	app.on("before-quit", () => {
		terminalManager.cleanup();
	});

	return window;
}

PLATFORM.IS_LINUX && app.disableHardwareAcceleration();

PLATFORM.IS_WINDOWS &&
	app.setAppUserModelId(ENVIRONMENT.IS_DEV ? process.execPath : makeAppId());

app.commandLine.appendSwitch("force-color-profile", "srgb");
