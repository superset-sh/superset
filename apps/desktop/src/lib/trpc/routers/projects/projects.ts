import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { basename } from "node:path";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { db } from "../../../../main/lib/db";
import type { RecentProject } from "../../../../main/lib/db/schemas";

/**
 * Projects router
 * Handles project selection, recents management, and workspace creation
 */
export const createProjectsRouter = (window: BrowserWindow) => {
	return router({
		/**
		 * Open a new project via folder picker
		 * Adds to recents and returns path for UI to handle
		 */
		openProject: publicProcedure.mutation(async () => {
			const result = await dialog.showOpenDialog(window, {
				properties: ["openDirectory"],
				title: "Open Project",
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false as const };
			}

			const path = result.filePaths[0];
			const name = basename(path);

			await db.update((data) => {
				const existingIndex = data.recentProjects.findIndex(
					(p) => p.path === path,
				);
				if (existingIndex !== -1) {
					data.recentProjects[existingIndex].lastOpenedAt = Date.now();
				} else {
					data.recentProjects.push({
						path,
						name,
						lastOpenedAt: Date.now(),
					});
				}
			});

			return {
				success: true as const,
				path,
				name,
			};
		}),
		openRecent: publicProcedure
			.input(z.object({ path: z.string() }))
			.mutation(async ({ input }) => {
				const { path } = input;
				const name = basename(path);

				await db.update((data) => {
					const recent = data.recentProjects.find((p) => p.path === path);
					if (recent) {
						recent.lastOpenedAt = Date.now();
					}
				});

				return {
					success: true as const,
					path,
					name,
				};
			}),
		getRecents: publicProcedure.query((): RecentProject[] => {
			return db.data.recentProjects
				.slice()
				.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
		}),
		removeRecent: publicProcedure
			.input(z.object({ path: z.string() }))
			.mutation(async ({ input }) => {
				await db.update((data) => {
					data.recentProjects = data.recentProjects.filter(
						(p) => p.path !== input.path,
					);
				});

				return { success: true };
			}),
	});
};

export type ProjectsRouter = ReturnType<typeof createProjectsRouter>;
