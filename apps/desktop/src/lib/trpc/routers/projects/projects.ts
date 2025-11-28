import { basename } from "node:path";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { db } from "main/lib/db";
import type { Project } from "main/lib/db/schemas";
import { nanoid } from "nanoid";
import { PROJECT_COLOR_VALUES } from "shared/constants/project-colors";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getGitRoot } from "../workspaces/utils/git";
import { assignRandomColor } from "./utils/colors";

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
				return { canceled: true };
			}

			const selectedPath = result.filePaths[0];

			let mainRepoPath: string;
			try {
				mainRepoPath = await getGitRoot(selectedPath);
			} catch (_error) {
				throw new Error("Selected folder is not in a git repository");
			}

			const name = basename(mainRepoPath);

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
					color: assignRandomColor(),
					tabOrder: null,
					lastOpenedAt: Date.now(),
					createdAt: Date.now(),
				};

				await db.update((data) => {
					// biome-ignore lint/style/noNonNullAssertion: project is assigned above, TypeScript can't see it inside callback
					data.projects.push(project!);
				});
			}

			return {
				canceled: false,
				project,
			};
		}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().trim().min(1).optional(),
						color: z
							.string()
							.refine(
								(value) => PROJECT_COLOR_VALUES.includes(value),
								"Invalid project color",
							)
							.optional(),
					}),
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const project = data.projects.find((p) => p.id === input.id);
					if (!project) {
						throw new Error(`Project ${input.id} not found`);
					}

					if (input.patch.name !== undefined) {
						project.name = input.patch.name;
					}

					if (input.patch.color !== undefined) {
						project.color = input.patch.color;
					}

					project.lastOpenedAt = Date.now();
				});

				return { success: true };
			}),

		reorder: publicProcedure
			.input(
				z.object({
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const { fromIndex, toIndex } = input;

					const activeProjects = data.projects
						.filter((p) => p.tabOrder !== null)
						// biome-ignore lint/style/noNonNullAssertion: filter guarantees tabOrder is not null
						.sort((a, b) => a.tabOrder! - b.tabOrder!);

					if (
						fromIndex < 0 ||
						fromIndex >= activeProjects.length ||
						toIndex < 0 ||
						toIndex >= activeProjects.length
					) {
						throw new Error("Invalid fromIndex or toIndex");
					}

					const [removed] = activeProjects.splice(fromIndex, 1);
					activeProjects.splice(toIndex, 0, removed);

					activeProjects.forEach((project, index) => {
						const p = data.projects.find((p) => p.id === project.id);
						if (p) {
							p.tabOrder = index;
						}
					});
				});

				return { success: true };
			}),
	});
};

export type ProjectsRouter = ReturnType<typeof createProjectsRouter>;
