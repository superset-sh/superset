import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { basename } from "node:path";
import { nanoid } from "nanoid";
import { publicProcedure, router } from "../..";
import { db } from "../../../../main/lib/db";
import type { Project } from "../../../../main/lib/db/schemas";
import { isGitRepo } from "../workspaces/utils/git";

export const createProjectsRouter = (window: BrowserWindow) => {
	return router({
		getRecents: publicProcedure.query((): Project[] => {
			return db.data.projects
				.slice()
				.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
		}),

		openNew: publicProcedure.mutation(async () => {
			const result = await dialog.showOpenDialog(window, {
				properties: ["openDirectory"],
				title: "Open Project",
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false as const };
			}

			const mainRepoPath = result.filePaths[0];
			const name = basename(mainRepoPath);

			if (!(await isGitRepo(mainRepoPath))) {
				return {
					success: false as const,
					error: "Selected folder is not a git repository",
				};
			}

			let project = db.data.projects.find(
				(p) => p.mainRepoPath === mainRepoPath,
			);

			if (project) {
				await db.update((data) => {
					const p = data.projects.find((p) => p.id === project?.id);
					if (p) {
						p.lastOpenedAt = Date.now();
					}
				});
			} else {
				project = {
					id: nanoid(),
					mainRepoPath,
					name,
					lastOpenedAt: Date.now(),
					createdAt: Date.now(),
				};

				await db.update((data) => {
					data.projects.push(project!);
				});
			}

			return {
				success: true as const,
				project,
			};
		}),
	});
};

export type ProjectsRouter = ReturnType<typeof createProjectsRouter>;
