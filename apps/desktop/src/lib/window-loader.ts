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
		props.browserWindow.loadURL(url);
	} else {
		// Production: load from custom protocol with hash routing
		// Origin becomes: superset://app (trusted by Better Auth)
		const fileName = props.htmlFile.split("/").pop() || "index.html";
		const url = `${PROTOCOL_SCHEME}://app/${fileName}#/`;
		props.browserWindow.loadURL(url);
	}
}
