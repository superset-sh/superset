import { homedir } from "node:os";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { publicProcedure, router } from "..";

/**
 * Window router for window controls
 * Handles minimize, maximize, close, and platform detection
 *
 * Uses a getter function to always access the current window,
 * allowing window recreation on macOS without stale references.
 */
export const createWindowRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		minimize: publicProcedure.mutation(() => {
			const window = getWindow();
			if (!window) return { success: false };
			window.minimize();
			return { success: true };
		}),

		maximize: publicProcedure.mutation(() => {
			const window = getWindow();
			if (!window) return { success: false, isMaximized: false };
			if (window.isMaximized()) {
				window.unmaximize();
			} else {
				window.maximize();
			}
			return { success: true, isMaximized: window.isMaximized() };
		}),

		close: publicProcedure.mutation(() => {
			const window = getWindow();
			if (!window) return { success: false };
			window.close();
			return { success: true };
		}),

		isMaximized: publicProcedure.query(() => {
			const window = getWindow();
			if (!window) return false;
			return window.isMaximized();
		}),

		getPlatform: publicProcedure.query(() => {
			return process.platform;
		}),

		getHomeDir: publicProcedure.query(() => {
			return homedir();
		}),

		selectImageFile: publicProcedure.mutation(async () => {
			const window = getWindow();
			if (!window) {
				return { canceled: true, dataUrl: null };
			}

			const result = await dialog.showOpenDialog(window, {
				properties: ["openFile"],
				title: "Select Organization Logo",
				filters: [
					{
						name: "Images",
						extensions: ["png", "jpg", "jpeg", "webp"],
					},
				],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { canceled: true, dataUrl: null };
			}

			// Read the file and convert to base64 data URL
			const fs = await import("node:fs/promises");
			const path = await import("node:path");
			const filePath = result.filePaths[0];
			const buffer = await fs.readFile(filePath);
			const ext = path.extname(filePath).slice(1).toLowerCase();
			const mimeType = ext === "jpg" ? "jpeg" : ext;
			const base64 = buffer.toString("base64");
			const dataUrl = `data:image/${mimeType};base64,${base64}`;

			return { canceled: false, dataUrl };
		}),
	});
};

export type WindowRouter = ReturnType<typeof createWindowRouter>;
