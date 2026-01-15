import type { BrowserWindow } from "electron";
import { PORTS, PROTOCOL_SCHEME } from "shared/constants";
import { env } from "shared/env.shared";

/** Window IDs defined in the router configuration */
type WindowId = "main" | "about";

/**
 * Load an Electron window with the appropriate URL for TanStack Router.
 * Uses hash-based routing for compatibility with Electron's custom protocol.
 *
 * - Development: loads from Vite dev server at http://localhost:PORT/#/
 * - Production: loads from custom protocol at superset://app/index.html#/
 *   (provides stable origin for Better Auth CORS)
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
		const url = `http://localhost:${PORTS.VITE_DEV_SERVER}/#/`;
		console.log(`[window-loader] Loading dev URL: ${url}`);
		props.browserWindow.loadURL(url).catch((error) => {
			console.error("[window-loader] Failed to load dev URL:", error);
		});
	} else {
		// Production: load from custom protocol with hash routing
		// Origin becomes: superset://app (trusted by Better Auth)
		// Split on both forward and back slashes for cross-platform compatibility
		const fileName = props.htmlFile.split(/[/\\]/).pop() || "index.html";
		const url = `${PROTOCOL_SCHEME}://app/${fileName}#/`;
		console.log(`[window-loader] Loading production URL: ${url}`);
		console.log(`[window-loader] HTML file path: ${props.htmlFile}`);
		props.browserWindow.loadURL(url).catch((error) => {
			console.error("[window-loader] Failed to load production URL:", error);
			console.error("[window-loader] Attempted URL:", url);
		});
	}
}
