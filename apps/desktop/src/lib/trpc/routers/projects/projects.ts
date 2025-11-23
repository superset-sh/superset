import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BrowserWindow } from "electron";
import { app, dialog } from "electron";
import { db } from "main/lib/db";
import type { Project } from "main/lib/db/schemas";
import { nanoid } from "nanoid";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getGitRoot } from "../workspaces/utils/git";
import { assignRandomColor } from "./utils/colors";

export const createProjectsRouter = (window: BrowserWindow) => {
	return router({
		getRecents: publicProcedure.query((): Project[] => {
			const projects = db.data.projects ?? [];
			return projects
				.slice()
				.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
		}),

		openNew: publicProcedure.mutation(async () => {
			const result = await dialog.showOpenDialog(window, {
				properties: ["openDirectory"],
				title: "Open Project",
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false };
			}

			const selectedPath = result.filePaths[0];

			let mainRepoPath: string;
			try {
				mainRepoPath = await getGitRoot(selectedPath);
			} catch (_error) {
				return {
					success: false,
					error: "Selected folder is not in a git repository",
				};
			}

			const name = basename(mainRepoPath);

			const projects = db.data.projects ?? [];
			let project = projects.find((p) => p.mainRepoPath === mainRepoPath);

			if (project) {
				await db.update((data) => {
					const existingProjects = data.projects ?? [];
					const p = existingProjects.find((p) => p.id === project?.id);
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
					if (!data.projects) {
						data.projects = [];
					}
					data.projects.push(project!);
				});
			}

			return {
				success: true as const,
				project,
			};
		}),

		cloneRepo: publicProcedure
			.input(
				z.object({
					url: z.string().url(),
					targetDirectory: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				try {
					// Determine target directory
					let targetDir = input.targetDirectory;

					if (!targetDir) {
						// Show directory picker
						const result = await dialog.showOpenDialog(window, {
							properties: ["openDirectory", "createDirectory"],
							title: "Select Clone Destination",
						});

						if (result.canceled || result.filePaths.length === 0) {
							return { success: false as const, error: "No directory selected" };
						}

						targetDir = result.filePaths[0];
					}

					// Extract repo name from URL
					const repoName = input.url
						.split("/")
						.pop()
						?.replace(/\.git$/, "");
					if (!repoName) {
						return {
							success: false as const,
							error: "Invalid repository URL",
						};
					}

					const clonePath = join(targetDir, repoName);

					// Clone the repository
					const git = simpleGit();
					await git.clone(input.url, clonePath);

					// Add to projects
					const name = basename(clonePath);
					const project: Project = {
						id: nanoid(),
						mainRepoPath: clonePath,
						name,
						color: assignRandomColor(),
						tabOrder: null,
						lastOpenedAt: Date.now(),
						createdAt: Date.now(),
					};

					await db.update((data) => {
						if (!data.projects) {
							data.projects = [];
						}
						data.projects.push(project);
					});

					return {
						success: true as const,
						project,
					};
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					return {
						success: false as const,
						error: `Failed to clone repository: ${errorMessage}`,
					};
				}
			}),

		connectSSH: publicProcedure
			.input(
				z.object({
					host: z.string(),
					username: z.string(),
					port: z.number().optional().default(22),
					privateKeyPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				try {
					// Show directory picker for where to clone/mount
					const result = await dialog.showOpenDialog(window, {
						properties: ["openDirectory", "createDirectory"],
						title: "Select Local Directory for SSH Connection",
					});

					if (result.canceled || result.filePaths.length === 0) {
						return { success: false as const, error: "No directory selected" };
					}

					const localPath = result.filePaths[0];

					// Create connection string
					const connectionString = `${input.username}@${input.host}`;
					const name = `SSH: ${connectionString}`;

					// For now, we'll just create a project entry
					// In a full implementation, you'd set up SSH tunnel/mount here
					const project: Project = {
						id: nanoid(),
						mainRepoPath: localPath,
						name,
						color: assignRandomColor(),
						tabOrder: null,
						lastOpenedAt: Date.now(),
						createdAt: Date.now(),
					};

					await db.update((data) => {
						if (!data.projects) {
							data.projects = [];
						}
						data.projects.push(project);
					});

					return {
						success: true as const,
						project,
						message: "SSH connection placeholder created",
					};
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					return {
						success: false as const,
						error: `Failed to setup SSH connection: ${errorMessage}`,
					};
				}
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
