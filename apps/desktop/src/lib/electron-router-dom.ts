import type { BrowserWindow } from "electron";
import { createElectronRouter } from "electron-router-dom";
import { PORTS } from "shared/constants";

const electronRouter = createElectronRouter({
	port: PORTS.VITE_DEV_SERVER,
	types: {
		ids: ["main", "about"],
	},
});

export const { Router, settings } = electronRouter;

/** Window IDs defined in the router configuration */
type WindowId = "main" | "about";

/**
 * Custom registerRoute that uses NODE_ENV instead of app.isPackaged.
 * This allows `electron-vite preview` (bun start) to load built files
 * instead of trying to connect to a dev server.
 *
 * - Development (NODE_ENV=development): loads from dev server
 * - Preview/Production: loads from built HTML file
 */
export function registerRoute(props: {
	id: WindowId;
	browserWindow: BrowserWindow;
	htmlFile: string;
	query?: Record<string, string>;
}): void {
	const isDev = process.env.NODE_ENV === "development";

	if (isDev) {
		// Development: use the library's default behavior (loads from dev server)
		electronRouter.registerRoute(props);
	} else {
		// Preview or Production: load from file with hash routing
		const windowId = props.id || "main";
		let url = `/${windowId}`;
		if (props.query) {
			const query = new URLSearchParams(props.query).toString();
			url = `${url}?${query}`;
		}
		props.browserWindow.loadFile(props.htmlFile, { hash: url });
	}
}
