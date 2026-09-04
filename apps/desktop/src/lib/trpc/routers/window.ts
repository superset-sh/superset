import fs from "node:fs/promises";
import { homedir } from "node:os";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { dialog } from "electron";
import { menuEmitter } from "main/lib/menu-events";
import { getOrg, setOrg } from "main/lib/window-registry/window-registry";
import { getImageMimeType } from "shared/file-types";
import { z } from "zod";
import { publicProcedure, router } from "..";

// Chromium renders zoom factors 0.25–5 (level = log1.2(factor)); stepping
// past that would only bank presses that do nothing until the level walks back.
const MIN_ZOOM_LEVEL = Math.log(0.25) / Math.log(1.2);
const MAX_ZOOM_LEVEL = Math.log(5) / Math.log(1.2);

export const createWindowRouter = () => {
	return router({
		minimize: publicProcedure.mutation(({ ctx }) => {
			const window = ctx.senderWindow;
			if (!window) return { success: false };
			window.minimize();
			return { success: true };
		}),

		maximize: publicProcedure.mutation(({ ctx }) => {
			const window = ctx.senderWindow;
			if (!window) return { success: false, isMaximized: false };
			if (window.isMaximized()) {
				window.unmaximize();
			} else {
				window.maximize();
			}
			return { success: true, isMaximized: window.isMaximized() };
		}),

		close: publicProcedure.mutation(({ ctx }) => {
			const window = ctx.senderWindow;
			if (!window) return { success: false };
			window.close();
			return { success: true };
		}),

		isMaximized: publicProcedure.query(({ ctx }) => {
			const window = ctx.senderWindow;
			if (!window) return false;
			return window.isMaximized();
		}),

		/** Open a new platform window on the same org as the calling window. */
		openNew: publicProcedure.mutation(({ ctx }) => {
			// Resolve the caller's org here (deterministic) rather than letting the
			// menu handler infer it from focus, which can shift before the handler runs.
			const orgId = ctx.senderWindow ? getOrg(ctx.senderWindow.id) : null;
			menuEmitter.emit("new-window", { orgId });
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
				if (!ctx.senderWindow) {
					return { success: false };
				}
				setOrg({
					windowId: ctx.senderWindow.id,
					orgId: input.organizationId,
				});
				return { success: true };
			}),

		getPlatform: publicProcedure.query(() => {
			return process.platform;
		}),

		// Authoritative page-zoom factor (1 = 100%); see useZoomFactor.
		getZoomFactor: publicProcedure.query(({ ctx }) => {
			const window = ctx.senderWindow;
			if (!window) return 1;
			return window.webContents.getZoomFactor();
		}),

		// Page zoom for the calling window, stepping like Electron's
		// zoomIn/zoomOut/resetZoom menu roles (0.5 zoom levels, 0 = 100%).
		zoom: publicProcedure
			.input(z.object({ direction: z.enum(["in", "out", "reset"]) }))
			.mutation(({ ctx, input }) => {
				const window = ctx.senderWindow;
				if (!window) return { success: false };
				const { webContents } = window;
				const next =
					input.direction === "reset"
						? 0
						: webContents.getZoomLevel() +
							(input.direction === "in" ? 0.5 : -0.5);
				webContents.setZoomLevel(
					Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, next)),
				);
				return { success: true };
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
				const window = ctx.senderWindow;
				if (!window) {
					return { canceled: true, path: null };
				}

				const result = await dialog.showOpenDialog(window, {
					properties: ["openDirectory", "createDirectory"],
					title:
						input?.title ??
						i18n._(
							msg({
								message: "Select Directory",
							}),
						),
					defaultPath: input?.defaultPath ?? undefined,
				});

				if (result.canceled || result.filePaths.length === 0) {
					return { canceled: true, path: null };
				}

				return { canceled: false, path: result.filePaths[0] };
			}),

		selectImageFile: publicProcedure.mutation(async ({ ctx }) => {
			const window = ctx.senderWindow;
			if (!window) {
				return { canceled: true, dataUrl: null };
			}

			const result = await dialog.showOpenDialog(window, {
				properties: ["openFile"],
				title: i18n._(
					msg({
						message: "Select Organization Logo",
					}),
				),
				filters: [
					{
						name: i18n._(
							msg({
								message: "Images",
							}),
						),
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
