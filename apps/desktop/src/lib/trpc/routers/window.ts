import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import {
	hasOtherMountedPaneClient,
	markPaneClientMounted,
	markPaneClientUnmounted,
} from "main/lib/pane-presence";
import { hasOtherLivePaneWindow, openPaneWindow } from "main/windows/pane";
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

		openPane: publicProcedure
			.input(
				z.object({
					paneId: z.string().min(1),
					paneName: z.string().optional(),
					workspaceName: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const result = openPaneWindow(input);
				return { success: true, reused: result.reused };
			}),

		hasLivePaneWindow: publicProcedure
			.input(
				z.object({
					paneId: z.string().min(1),
				}),
			)
			.query(({ ctx, input }) => {
				const callerWindow = ctx.event
					? BrowserWindow.fromWebContents(ctx.event.sender)
					: null;
				const callerWebContentsId = ctx.event?.sender.id;
				const hasOtherMountedClient =
					typeof callerWebContentsId === "number"
						? hasOtherMountedPaneClient(input.paneId, callerWebContentsId)
						: false;
				return {
					hasLiveWindow:
						hasOtherLivePaneWindow(input.paneId, callerWindow) ||
						hasOtherMountedClient,
				};
			}),

		markPaneMounted: publicProcedure
			.input(
				z.object({
					paneId: z.string().min(1),
				}),
			)
			.mutation(({ ctx, input }) => {
				const callerWebContentsId = ctx.event?.sender.id;
				if (typeof callerWebContentsId === "number") {
					markPaneClientMounted(input.paneId, callerWebContentsId);
				}
				return { success: true };
			}),

		markPaneUnmounted: publicProcedure
			.input(
				z.object({
					paneId: z.string().min(1),
				}),
			)
			.mutation(({ ctx, input }) => {
				const callerWebContentsId = ctx.event?.sender.id;
				if (typeof callerWebContentsId === "number") {
					markPaneClientUnmounted(input.paneId, callerWebContentsId);
				}
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
			const ext = path.extname(filePath).slice(1).toLowerCase();
			const mimeType = ext === "jpg" ? "jpeg" : ext;
			const base64 = buffer.toString("base64");
			const dataUrl = `data:image/${mimeType};base64,${base64}`;

			return { canceled: false, dataUrl };
		}),
	});
};

export type WindowRouter = ReturnType<typeof createWindowRouter>;
