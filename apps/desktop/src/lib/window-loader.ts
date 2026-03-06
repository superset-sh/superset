import type { BrowserWindow } from "electron";
import { env } from "shared/env.shared";

/** Window IDs defined in the router configuration */
type WindowId = "main" | "about";

/**
 * Load an Electron window with the appropriate URL for TanStack Router.
 * Uses hash-based routing for compatibility with Electron's file:// protocol.
 *
 * - Development: loads from Vite dev server at http://localhost:PORT/#/
 * - Production: loads from built HTML file with hash routing (#/)
 */
export function registerRoute(props: {
	id: WindowId;
	browserWindow: BrowserWindow;
	htmlFile: string;
	query?: Record<string, string>;
}): void {
	const isDev = env.NODE_ENV === "development";

	if (isDev) {
		// Development: load from Vite dev server with hash routing
		const url = `http://localhost:${env.DESKTOP_VITE_PORT}/#/`;
		console.log("[window-loader] Loading development URL:", url);
		props.browserWindow.loadURL(url);
	} else if (process.platform === "win32") {
		// Production (Windows): use custom protocol for proper dynamic import support.
		// file:// protocol breaks ES module dynamic imports (code-split chunks) on Windows.
		const url = "superset-app://app/index.html#/";
		console.log("[window-loader] Loading custom protocol URL:", url);
		props.browserWindow.loadURL(url);
	} else {
		// Production (macOS/Linux): load from file with hash routing
		// TanStack Router uses hash-based routing, so we always start at #/
		console.log("[window-loader] Loading file:", props.htmlFile);
		props.browserWindow.loadFile(props.htmlFile, { hash: "/" });
	}

	// Log successful loads
	props.browserWindow.webContents.on("did-finish-load", () => {
		console.log(
			"[window-loader] Successfully loaded:",
			props.browserWindow.webContents.getURL(),
		);
	});

	// Log and handle load failures
	props.browserWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			console.error("[window-loader] Failed to load URL:", validatedURL);
			console.error("[window-loader] Error code:", errorCode);
			console.error("[window-loader] Error description:", errorDescription);
		},
	);
}
