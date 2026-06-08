import { BrowserWindow, shell } from "electron";

/**
 * Standalone browser windows popped out of a browser pane. Tracked so they can
 * be closed alongside the main window.
 */
const popoutWindows = new Set<BrowserWindow>();

/**
 * Open `url` in its own OS window, reusing the desktop session partition so the
 * user stays logged in. Unlike "Open in Browser" (which hands off to the system
 * browser via shell.openExternal and loses the session), this keeps the page
 * inside a Superset-owned window.
 *
 * The page is hosted in an isolated <webview> — mirroring the in-pane browser's
 * process isolation — rather than loaded into the window's own main frame.
 */
export function openBrowserPopout(url: string): BrowserWindow | null {
	if (!/^https?:\/\//.test(url)) return null;

	const window = new BrowserWindow({
		width: 1200,
		height: 800,
		autoHideMenuBar: true,
		backgroundColor: "#252525",
		webPreferences: {
			webviewTag: true,
			partition: "persist:superset",
			sandbox: true,
			contextIsolation: true,
		},
	});

	popoutWindows.add(window);
	window.on("closed", () => popoutWindows.delete(window));

	// Route popups / target=_blank from the hosted page to the system browser
	// (the popout host page can't be navigated away from).
	window.webContents.on("did-attach-webview", (_event, guest) => {
		guest.setWindowOpenHandler(({ url: popupUrl }) => {
			if (/^https?:\/\//.test(popupUrl)) shell.openExternal(popupUrl);
			return { action: "deny" };
		});
	});

	const host = `<!doctype html><html><head><meta charset="utf-8"><title>Superset Browser</title>
<style>html,body{margin:0;height:100%;background:#252525}webview{position:absolute;inset:0;border:0}</style>
</head><body><webview src="${encodeURI(url)}" partition="persist:superset" allowpopups></webview></body></html>`;
	window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(host)}`);

	return window;
}

/** Close every popped-out browser window (called when the main window closes). */
export function closeAllBrowserPopouts(): void {
	for (const window of popoutWindows) {
		if (!window.isDestroyed()) window.close();
	}
	popoutWindows.clear();
}
