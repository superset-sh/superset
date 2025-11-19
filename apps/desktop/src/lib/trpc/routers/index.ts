import type { BrowserWindow } from "electron";
import { router } from "..";
import { createWindowRouter } from "./window";

/**
 * Main application router
 * Combines all domain-specific routers into a single router
 */
export const createAppRouter = (window: BrowserWindow) => {
	return router({
		window: createWindowRouter(window),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
