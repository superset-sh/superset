import { app, BrowserWindow } from "electron";
import { env } from "main/env.main";
import { isBrowserPanePopup } from "main/lib/browser/popup-window";
import { loadReactDevToolsExtension } from "main/lib/extensions";
import { safeOpenExternal } from "main/lib/safe-url";
import { PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";
import { openInitialWindow } from "../../utils/open-initial-window";
import { isSameAppDocument } from "../../utils/same-app-document";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

function guardWebContents(
	_: Electron.Event,
	contents: Electron.WebContents,
): void {
	if (contents.getType() === "webview") return;
	// Whatever a <webview> tag asks for, guest content never gets a preload or Node.
	contents.on("will-attach-webview", (_event, webPreferences) => {
		delete webPreferences.preload;
		delete (webPreferences as { preloadURL?: string }).preloadURL;
		webPreferences.nodeIntegration = false;
		webPreferences.nodeIntegrationInSubFrames = false;
		webPreferences.nodeIntegrationInWorker = false;
		webPreferences.contextIsolation = true;
		webPreferences.webSecurity = true;
		webPreferences.allowRunningInsecureContent = false;
	});
	// Fallback only: app windows and browser-pane popups replace it with their own.
	contents.setWindowOpenHandler(({ url }) => {
		void safeOpenExternal(url);
		return { action: "deny" };
	});
	contents.on("will-navigate", (event, url) => {
		// A popup a browser pane opened navigates in place: it is a real
		// `window.open` window (an OAuth sign-in, typically) that has to stay
		// on the pane's session. Handing it to the system browser strands the
		// sign-in in a different cookie jar than the pane that started it
		// (SUPER-1272). Checked here rather than above because the popup is
		// marked on `did-create-window`, after this listener is attached.
		if (isBrowserPanePopup(contents)) return;
		// Only the app's own document: any other would get the preload bridge.
		if (isSameAppDocument(contents.getURL(), url)) return;
		event.preventDefault();
		void safeOpenExternal(url);
	});
}

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	await loadReactDevToolsExtension();

	let window = await openInitialWindow({
		guardWebContents: () => app.on("web-contents-created", guardWebContents),
		restoreWindows,
		getAllWindows: () => BrowserWindow.getAllWindows(),
		createWindow,
	});

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

	// macOS: keep the app alive (standard behavior) — tray/dock provide re-entry.
	// Windows/Linux: quit the app UI. Host-services are coupled to the app and
	// stop with it; v1 pty-daemon survives separately.
	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());

	return window;
}

// macOS Sequoia+: occluded window throttling can corrupt GPU compositor layers
if (PLATFORM.IS_MAC) {
	app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

PLATFORM.IS_WINDOWS &&
	app.setAppUserModelId(
		env.NODE_ENV === "development" ? process.execPath : makeAppId(),
	);

app.commandLine.appendSwitch("force-color-profile", "srgb");

if (env.NODE_ENV === "development" && process.env.RENDERER_REMOTE_DEBUG_PORT) {
	app.commandLine.appendSwitch(
		"remote-debugging-port",
		process.env.RENDERER_REMOTE_DEBUG_PORT,
	);
}

// Each xterm pane holds one WebGL context. v2 parking keeps panes alive
// across workspace switches, so cumulative contexts can reach the low
// hundreds — past Chromium's default cap of 16, Blink force-evicts the
// oldest context and the terminal blanks out. 256 covers the parking load
// while staying bounded enough that a runaway leak still surfaces (Tabby
// raises this to 9000, which masks leaks).
app.commandLine.appendSwitch("max-active-webgl-contexts", "256");
