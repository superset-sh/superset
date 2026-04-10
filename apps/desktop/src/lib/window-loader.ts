import { pathToFileURL } from "node:url";
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
	} else {
		// Production: explicitly construct the file:// URL with hash routing.
		// Electron's loadFile(..., { hash }) can transiently resolve to Chromium's
		// internal error page for packaged app.asar paths, leaving a white window.
		const url = pathToFileURL(props.htmlFile);
		url.hash = "/";
		console.log("[window-loader] Loading file:", props.htmlFile);
		console.log("[window-loader] Loading production URL:", url.toString());
		props.browserWindow.loadURL(url.toString());
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
