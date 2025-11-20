import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { basename } from "node:path";
import { z } from "zod";
import { publicProcedure, router } from "..";
import { readDb, writeDb } from "../../../main/lib/db";
import type { RecentProject } from "../../../main/lib/db/schemas";

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
			const timestamp = Date.now();

			// Add to recents (or update if exists)
			await writeDb((data) => {
				const existingIndex = data.recentProjects.findIndex(
					(p) => p.path === path,
				);
				if (existingIndex !== -1) {
					data.recentProjects[existingIndex].lastOpened = timestamp;
				} else {
					data.recentProjects.push({
						path,
						name,
						lastOpened: timestamp,
					});
				}
			});

			return {
				success: true as const,
				path,
				name,
			};
		}),

		/**
		 * Open a recent project
		 * Updates timestamp and returns path for UI to handle
		 */
		openRecent: publicProcedure
			.input(z.object({ path: z.string() }))
			.mutation(async ({ input }) => {
				const { path } = input;
				const name = basename(path);
				const timestamp = Date.now();

				// Update recent project timestamp
				await writeDb((data) => {
					const recent = data.recentProjects.find((p) => p.path === path);
					if (recent) {
						recent.lastOpened = timestamp;
					}
				});

				return {
					success: true as const,
					path,
					name,
				};
			}),

		/**
		 * Get all recent projects sorted by last opened
		 */
		getRecents: publicProcedure.query((): RecentProject[] => {
			const db = readDb();
			return db.recentProjects
				.slice()
				.sort((a, b) => b.lastOpened - a.lastOpened);
		}),

		/**
		 * Remove a project from recents
		 */
		removeRecent: publicProcedure
			.input(z.object({ path: z.string() }))
			.mutation(async ({ input }) => {
				await writeDb((data) => {
					data.recentProjects = data.recentProjects.filter(
						(p) => p.path !== input.path,
					);
				});

				return { success: true };
			}),
	});
};

export type ProjectsRouter = ReturnType<typeof createProjectsRouter>;
