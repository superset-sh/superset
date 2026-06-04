import fs from "node:fs/promises";
import { homedir } from "node:os";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { getImageMimeType } from "shared/file-types";
import { z } from "zod";
import { publicProcedure, router } from "..";

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

		getDirectoryStatus: publicProcedure
			.input(
				z.object({
					path: z.string(),
				}),
			)
			.query(async ({ input }) => {
				try {
					const stats = await fs.stat(input.path);
					return {
						exists: true,
						isDirectory: stats.isDirectory(),
					};
				} catch {
					return {
						exists: false,
						isDirectory: false,
					};
				}
			}),

		selectDirectory: publicProcedure
			.input(
				z
					.object({
						title: z.string().optional(),
						defaultPath: z.string().optional(),
					})
					.optional(),
			)
			.mutation(async ({ input }) => {
				const window = getWindow();
				if (!window) {
					return { canceled: true, path: null };
				}

				const result = await dialog.showOpenDialog(window, {
					properties: ["openDirectory", "createDirectory"],
					title: input?.title ?? "Select Directory",
					defaultPath: input?.defaultPath ?? undefined,
				});

				if (result.canceled || result.filePaths.length === 0) {
					return { canceled: true, path: null };
				}

				return { canceled: false, path: result.filePaths[0] };
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

			const filePath = result.filePaths[0];
			const buffer = await fs.readFile(filePath);
			const mimeType = getImageMimeType(filePath) ?? "image/png";
			const base64 = buffer.toString("base64");
			const dataUrl = `data:${mimeType};base64,${base64}`;

			return { canceled: false, dataUrl };
		}),
	});
};

export type WindowRouter = ReturnType<typeof createWindowRouter>;
