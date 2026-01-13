import type { BrowserWindow } from "electron";
import { PORTS } from "shared/constants";
import { env } from "shared/env.shared";

/** Window IDs defined in the router configuration */
type WindowId = "main" | "about";

/**
 * Load an Electron window with the appropriate URL for TanStack Router.
 * Uses hash-based routing for compatibility with Electron's file:// protocol.
 *
 * - Development (NODE_ENV=development): loads from Vite dev server at http://localhost:PORT/#/
 * - Preview/Production: loads from built HTML file with hash routing (#/)
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
		props.browserWindow.loadURL(url);
	} else {
		// Preview or Production: load from file with hash routing
		// TanStack Router uses hash-based routing, so we always start at #/
		props.browserWindow.loadFile(props.htmlFile, { hash: "/" });
	}
}
