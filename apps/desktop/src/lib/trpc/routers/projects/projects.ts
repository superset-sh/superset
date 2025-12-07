import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { db } from "main/lib/db";
import type { Project } from "main/lib/db/schemas";
import { nanoid } from "nanoid";
import { PROJECT_COLOR_VALUES } from "shared/constants/project-colors";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getDefaultBranch, getGitRoot } from "../workspaces/utils/git";
import { assignRandomColor } from "./utils/colors";

// Return types for openNew procedure
type OpenNewCanceled = { canceled: true };
type OpenNewSuccess = { canceled: false; project: Project };
type OpenNewNeedsGitInit = {
	canceled: false;
	needsGitInit: true;
	selectedPath: string;
};
type OpenNewError = { canceled: false; error: string };
export type OpenNewResult =
	| OpenNewCanceled
	| OpenNewSuccess
	| OpenNewNeedsGitInit
	| OpenNewError;

/**
 * Creates or updates a project record in the database.
 * If a project with the same mainRepoPath exists, updates lastOpenedAt.
 * Otherwise, creates a new project.
 */
async function upsertProject(
	mainRepoPath: string,
	defaultBranch: string,
): Promise<Project> {
	const name = basename(mainRepoPath);

	let project = db.data.projects.find((p) => p.mainRepoPath === mainRepoPath);

	if (project) {
		await db.update((data) => {
			const p = data.projects.find((p) => p.id === project?.id);
			if (p) {
				p.lastOpenedAt = Date.now();
				p.defaultBranch = defaultBranch;
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
			defaultBranch,
		};

		await db.update((data) => {
			// biome-ignore lint/style/noNonNullAssertion: project is assigned above, TypeScript can't see it inside callback
			data.projects.push(project!);
		});
	}

	return project;
}

// Safe filename regex: letters, numbers, dots, underscores, hyphens, spaces, and common unicode
// Allows most valid Git repo names while avoiding path traversal characters
const SAFE_REPO_NAME_REGEX = /^[a-zA-Z0-9._\- ]+$/;

/**
 * Extracts and validates a repository name from a git URL.
 * Handles HTTP/HTTPS URLs, SSH-style URLs (git@host:user/repo), and edge cases.
 */
function extractRepoName(urlInput: string): string | null {
	// Normalize: trim whitespace and strip trailing slashes
	let normalized = urlInput.trim().replace(/\/+$/, "");

	if (!normalized) return null;

	let repoSegment: string | undefined;

	// Try parsing as HTTP/HTTPS URL first
	try {
		const parsed = new URL(normalized);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			// Get pathname and strip query/hash (URL constructor handles this)
			const pathname = parsed.pathname;
			// Get the last segment of the path
			repoSegment = pathname.split("/").filter(Boolean).pop();
		}
	} catch {
		// Not a valid URL, try SSH-style parsing
	}

	// Fallback to SSH-style parsing (git@github.com:user/repo.git)
	if (!repoSegment) {
		// Handle SSH format: git@host:path or just path segments
		const colonIndex = normalized.indexOf(":");
		if (colonIndex !== -1 && !normalized.includes("://")) {
			// SSH-style: take everything after the colon
			normalized = normalized.slice(colonIndex + 1);
		}
		// Split by '/' and get the last segment
		repoSegment = normalized.split("/").filter(Boolean).pop();
	}

	if (!repoSegment) return null;

	// Strip query string and hash if present (for edge cases)
	repoSegment = repoSegment.split("?")[0].split("#")[0];

	// Remove trailing .git extension
	repoSegment = repoSegment.replace(/\.git$/, "");

	// Decode percent-encoded characters
	try {
		repoSegment = decodeURIComponent(repoSegment);
	} catch {
		// Invalid encoding, continue with raw value
	}

	// Trim any remaining whitespace or special characters at boundaries
	repoSegment = repoSegment.trim();

	// Validate against safe filename regex
	if (!repoSegment || !SAFE_REPO_NAME_REGEX.test(repoSegment)) {
		return null;
	}

	return repoSegment;
}

export const createProjectsRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }): Project | null => {
				return db.data.projects.find((p) => p.id === input.id) ?? null;
			}),

		getRecents: publicProcedure.query((): Project[] => {
			return db.data.projects
				.slice()
				.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
		}),

		openNew: publicProcedure.mutation(async (): Promise<OpenNewResult> => {
			const window = getWindow();
			if (!window) {
				return { canceled: false, error: "No window available" };
			}
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
				// Return a special response so the UI can offer to initialize git
				return {
					canceled: false,
					needsGitInit: true,
					selectedPath,
				};
			}

			const defaultBranch = await getDefaultBranch(mainRepoPath);
			const project = await upsertProject(mainRepoPath, defaultBranch);

			return {
				canceled: false,
				project,
			};
		}),

		initGitAndOpen: publicProcedure
			.input(z.object({ path: z.string() }))
			.mutation(async ({ input }) => {
				const git = simpleGit(input.path);

				// Initialize git repository with 'main' as default branch
				// Try with --initial-branch=main (Git 2.28+), fall back to plain init
				try {
					await git.init(["--initial-branch=main"]);
				} catch (err) {
					// Likely an older Git version that doesn't support --initial-branch
					console.warn(
						"Git init with --initial-branch failed, using fallback:",
						err,
					);
					await git.init();
				}

				// Create initial commit so we have a valid branch ref
				try {
					await git.raw(["commit", "--allow-empty", "-m", "Initial commit"]);
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : String(err);
					// Check for common git config issues
					if (
						errorMessage.includes("empty ident") ||
						errorMessage.includes("user.email") ||
						errorMessage.includes("user.name")
					) {
						throw new Error(
							"Git user not configured. Please run:\n" +
								'  git config --global user.name "Your Name"\n' +
								'  git config --global user.email "you@example.com"',
						);
					}
					throw new Error(`Failed to create initial commit: ${errorMessage}`);
				}

				// Get the current branch name (will be 'main' or 'master' depending on git version/config)
				const branchSummary = await git.branch();
				const defaultBranch = branchSummary.current || "main";

				const project = await upsertProject(input.path, defaultBranch);

				return { project };
			}),

		cloneRepo: publicProcedure
			.input(
				z.object({
					url: z.string().url(),
					// Trim and convert empty/whitespace strings to undefined
					targetDirectory: z
						.string()
						.trim()
						.optional()
						.transform((v) => (v && v.length > 0 ? v : undefined)),
				}),
			)
			.mutation(async ({ input }) => {
				try {
					let targetDir = input.targetDirectory;

					if (!targetDir) {
						const window = getWindow();
						if (!window) {
							return {
								canceled: false as const,
								success: false as const,
								error: "No window available",
							};
						}
						const result = await dialog.showOpenDialog(window, {
							properties: ["openDirectory", "createDirectory"],
							title: "Select Clone Destination",
						});

						// User canceled - return canceled state (not an error)
						if (result.canceled || result.filePaths.length === 0) {
							return { canceled: true as const, success: false as const };
						}

						targetDir = result.filePaths[0];
					}

					const repoName = extractRepoName(input.url);
					if (!repoName) {
						return {
							canceled: false as const,
							success: false as const,
							error: "Invalid repository URL",
						};
					}

					const clonePath = join(targetDir, repoName);

					// Check if we already have a project for this path
					const existingProject = db.data.projects.find(
						(p) => p.mainRepoPath === clonePath,
					);

					if (existingProject) {
						// Verify the filesystem path still exists
						try {
							await access(clonePath);
							// Directory exists - update lastOpenedAt and return existing project
							await db.update((data) => {
								const p = data.projects.find(
									(p) => p.id === existingProject.id,
								);
								if (p) {
									p.lastOpenedAt = Date.now();
								}
							});
							return {
								canceled: false as const,
								success: true as const,
								project: existingProject,
							};
						} catch {
							// Directory is missing - remove the stale project record and continue with clone
							await db.update((data) => {
								const index = data.projects.findIndex(
									(p) => p.id === existingProject.id,
								);
								if (index !== -1) {
									data.projects.splice(index, 1);
								}
							});
							// Continue to normal creation flow below
						}
					}

					// Check if target directory already exists (but not our project)
					if (existsSync(clonePath)) {
						return {
							canceled: false as const,
							success: false as const,
							error: `A folder named "${repoName}" already exists at this location. Please choose a different destination.`,
						};
					}

					// Clone the repository
					const git = simpleGit();
					await git.clone(input.url, clonePath);

					// Create new project
					const name = basename(clonePath);
					const defaultBranch = await getDefaultBranch(clonePath);
					const project: Project = {
						id: nanoid(),
						mainRepoPath: clonePath,
						name,
						color: assignRandomColor(),
						tabOrder: null,
						lastOpenedAt: Date.now(),
						createdAt: Date.now(),
						defaultBranch,
					};

					await db.update((data) => {
						data.projects.push(project);
					});

					return {
						canceled: false as const,
						success: true as const,
						project,
					};
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					return {
						canceled: false as const,
						success: false as const,
						error: `Failed to clone repository: ${errorMessage}`,
					};
				}
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
