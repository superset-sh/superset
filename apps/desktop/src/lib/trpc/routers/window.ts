import fs from "node:fs/promises";
import { homedir } from "node:os";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { menuEmitter } from "main/lib/menu-events";
import { getOrg, setOrg } from "main/lib/window-registry/window-registry";
import { getImageMimeType } from "shared/file-types";
import { z } from "zod";
import { publicProcedure, router } from "..";

export const createWindowRouter = (getWindow: () => BrowserWindow | null) => {
	// Resolve the window a call should act on: the window that sent the IPC
	// message (per-window correctness), falling back to the focused/last window.
	const resolveWindow = (
		senderWindow: BrowserWindow | null,
	): BrowserWindow | null => senderWindow ?? getWindow();

	return router({
		minimize: publicProcedure.mutation(({ ctx }) => {
			const window = resolveWindow(ctx.senderWindow);
			if (!window) return { success: false };
			window.minimize();
			return { success: true };
		}),

		maximize: publicProcedure.mutation(({ ctx }) => {
			const window = resolveWindow(ctx.senderWindow);
			if (!window) return { success: false, isMaximized: false };
			if (window.isMaximized()) {
				window.unmaximize();
			} else {
				window.maximize();
			}
			return { success: true, isMaximized: window.isMaximized() };
		}),

		close: publicProcedure.mutation(({ ctx }) => {
			const window = resolveWindow(ctx.senderWindow);
			if (!window) return { success: false };
			window.close();
			return { success: true };
		}),

		isMaximized: publicProcedure.query(({ ctx }) => {
			const window = resolveWindow(ctx.senderWindow);
			if (!window) return false;
			return window.isMaximized();
		}),

		/** Open a new platform window on the same org as the calling window. */
		openNew: publicProcedure.mutation(() => {
			menuEmitter.emit("new-window");
			return { success: true };
		}),

		/** The organization this window currently shows (per-window). */
		getActiveOrg: publicProcedure.query(({ ctx }) => {
			return ctx.senderWindow ? getOrg(ctx.senderWindow.id) : null;
		}),

		/** Set the organization for the calling window (window-local switch). */
		setActiveOrg: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.mutation(({ ctx, input }) => {
				if (ctx.senderWindow) {
					setOrg({
						windowId: ctx.senderWindow.id,
						orgId: input.organizationId,
					});
				}
				return { success: true };
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
				const window = resolveWindow(ctx.senderWindow);
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

		selectImageFile: publicProcedure.mutation(async ({ ctx }) => {
			const window = resolveWindow(ctx.senderWindow);
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
