import type { BrowserWindow } from "electron";
import { publicProcedure, router } from "..";

/**
 * Window router for window controls
 * Handles minimize, maximize, close, and platform detection
 */
export const createWindowRouter = (window: BrowserWindow) => {
	return router({
		minimize: publicProcedure.mutation(() => {
			window.minimize();
			return { success: true };
		}),

		maximize: publicProcedure.mutation(() => {
			if (window.isMaximized()) {
				window.unmaximize();
			} else {
				window.maximize();
			}
			return { success: true, isMaximized: window.isMaximized() };
		}),

		close: publicProcedure.mutation(() => {
			window.close();
			return { success: true };
		}),

		isMaximized: publicProcedure.query(() => {
			return window.isMaximized();
		}),

		getPlatform: publicProcedure.query(() => {
			return process.platform;
		}),
	});
};

export type WindowRouter = ReturnType<typeof createWindowRouter>;
