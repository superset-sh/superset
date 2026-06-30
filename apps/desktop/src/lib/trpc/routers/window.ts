import fs from "node:fs/promises";
import { homedir } from "node:os";
import { dialog } from "electron";
import { getManagedWindowByWebContents } from "main/windows/manager";
import { getImageMimeType } from "shared/file-types";
import { z } from "zod";
import { publicProcedure, router } from "..";

export const createWindowRouter = () => {
	return router({
		/**
		 * Identity of the calling window. Lets renderers distinguish themselves
		 * (e.g. to ignore self-originated cross-window state broadcasts).
		 */
		self: publicProcedure.query(({ ctx }) => {
			if (ctx.webContentsId === null) return null;
			const webContentsId = ctx.webContentsId;
			const managed = getManagedWindowByWebContents(webContentsId);
			return {
				windowId: managed?.id ?? null,
				webContentsId,
				workspaceId: managed?.workspaceId ?? null,
			};
		}),

		/**
		 * Open a workspace in a new window, optionally focused on a tab.
		 * Dynamic import: windows/main statically imports the app router, so a
		 * static import here would create a cycle (same pattern as lib/menu.ts).
		 */
		openWorkspaceWindow: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					focusTabId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { MainWindow } = await import("main/windows/main");
				await MainWindow({
					workspaceId: input.workspaceId,
					stagger: true,
					focusTabId: input.focusTabId,
				});
				return { success: true };
			}),

		minimize: publicProcedure.mutation(({ ctx }) => {
			if (!ctx.window) return { success: false };
			ctx.window.minimize();
			return { success: true };
		}),

		maximize: publicProcedure.mutation(({ ctx }) => {
			if (!ctx.window) return { success: false, isMaximized: false };
			if (ctx.window.isMaximized()) {
				ctx.window.unmaximize();
			} else {
				ctx.window.maximize();
			}
			return { success: true, isMaximized: ctx.window.isMaximized() };
		}),

		close: publicProcedure.mutation(({ ctx }) => {
			if (!ctx.window) return { success: false };
			ctx.window.close();
			return { success: true };
		}),

		isMaximized: publicProcedure.query(({ ctx }) => {
			if (!ctx.window) return false;
			return ctx.window.isMaximized();
		}),

		getPlatform: publicProcedure.query(() => {
			return process.platform;
		}),

		// Authoritative page-zoom factor (1 = 100%); see useZoomFactor.
		getZoomFactor: publicProcedure.query(() => {
			const window = getWindow();
			if (!window) return 1;
			return window.webContents.getZoomFactor();
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
			.mutation(async ({ ctx, input }) => {
				if (!ctx.window) {
					return { canceled: true, path: null };
				}

				const result = await dialog.showOpenDialog(ctx.window, {
					properties: ["openDirectory", "createDirectory"],
					title: input?.title ?? "Select Directory",
					defaultPath: input?.defaultPath ?? undefined,
				});

				if (result.canceled || result.filePaths.length === 0) {
					return { canceled: true, path: null };
				}

				return { canceled: false, path: result.filePaths[0] };
			}),

		selectImageFile: publicProcedure.mutation(async ({ ctx }) => {
			if (!ctx.window) {
				return { canceled: true, dataUrl: null };
			}

			const result = await dialog.showOpenDialog(ctx.window, {
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
