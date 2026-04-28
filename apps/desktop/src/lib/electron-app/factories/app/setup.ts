import { app, BrowserWindow, shell } from "electron";
import { env } from "main/env.main";
import { loadReactDevToolsExtension } from "main/lib/extensions";
import { PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	await loadReactDevToolsExtension();

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
			// Show hidden windows (macOS hide-to-tray) or restore minimized ones
			for (window of windows.reverse()) {
				window.show();
				window.focus();
			}
		}
	});

	app.on("web-contents-created", (_, contents) => {
		if (contents.getType() === "webview") return;
		contents.on("will-navigate", (event, url) => {
			// Always prevent in-app navigation for external URLs
			if (url.startsWith("http://") || url.startsWith("https://")) {
				event.preventDefault();
				shell.openExternal(url);
			}
		});
	});

	// macOS: keep the app alive (standard behavior) — tray/dock provide re-entry.
	// Windows/Linux: quit the app UI. Host-services survive via releaseAll()
	// and will be re-adopted on next launch.
	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());

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

// Chromium's default active-WebGL-context cap is 16 per renderer process
// (content/renderer/webgraphicscontext3d_provider_impl.cc). When exceeded,
// Blink's ForciblyLoseOldestContext fires `webglcontextlost` on the oldest
// xterm, producing the blank/garbled terminals reported in #3572, #3504,
// #3527. Each pane's xterm holds one WebGL context, and the v2 parking model
// keeps them alive across workspace switches — cumulative panes routinely
// reach the low hundreds. VS Code's 32 covers their ~16-terminal budget but
// is too low here; Tabby's 9000 is high enough to mask leaks. 256 sits in
// the middle: 16× the default, covers low-hundreds of panes, and stays
// bounded enough that a real leak still surfaces.
app.commandLine.appendSwitch("max-active-webgl-contexts", "256");

// Only expose CDP in development when a port is explicitly configured.
const cdpPort =
	env.NODE_ENV === "development"
		? process.env.DESKTOP_AUTOMATION_PORT
		: undefined;
if (cdpPort) {
	app.commandLine.appendSwitch("remote-debugging-port", cdpPort);
	app.commandLine.appendSwitch("remote-allow-origins", "*");
}
