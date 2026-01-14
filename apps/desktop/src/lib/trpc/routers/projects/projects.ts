import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	projects,
	type SelectProject,
	settings,
	workspaces,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, not } from "drizzle-orm";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { terminalManager } from "main/lib/terminal";
import { PROJECT_COLOR_VALUES } from "shared/constants/project-colors";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	activateProject,
	getBranchWorkspace,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../workspaces/utils/db-helpers";
import {
	getCurrentBranch,
	getDefaultBranch,
	getGitRoot,
	refreshDefaultBranch,
} from "../workspaces/utils/git";
import { getDefaultProjectColor } from "./utils/colors";
import { fetchGitHubOwner, getGitHubAvatarUrl } from "./utils/github";

type Project = SelectProject;

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
function upsertProject(mainRepoPath: string, defaultBranch: string): Project {
	const name = basename(mainRepoPath);

	const existing = localDb
		.select()
		.from(projects)
		.where(eq(projects.mainRepoPath, mainRepoPath))
		.get();

	if (existing) {
		localDb
			.update(projects)
			.set({ lastOpenedAt: Date.now(), defaultBranch })
			.where(eq(projects.id, existing.id))
			.run();
		return { ...existing, lastOpenedAt: Date.now(), defaultBranch };
	}

	const project = localDb
		.insert(projects)
		.values({
			mainRepoPath,
			name,
			color: getDefaultProjectColor(),
			defaultBranch,
		})
		.returning()
		.get();

	return project;
}

/**
 * Ensures a project has a main (branch) workspace.
 * If one doesn't exist, creates it automatically.
 * This is called after opening/creating a project to provide a default workspace.
 */
async function ensureMainWorkspace(project: Project): Promise<void> {
	const existingBranchWorkspace = getBranchWorkspace(project.id);

	// If branch workspace already exists, just touch it and return
	if (existingBranchWorkspace) {
		touchWorkspace(existingBranchWorkspace.id);
		setLastActiveWorkspace(existingBranchWorkspace.id);
		return;
	}

	// Get current branch from main repo
	const branch = await getCurrentBranch(project.mainRepoPath);
	if (!branch) {
		console.warn(
			`[ensureMainWorkspace] Could not determine current branch for project ${project.id}`,
		);
		return;
	}

	// Insert new branch workspace with conflict handling for race conditions
	// The unique partial index (projectId WHERE type='branch') prevents duplicates
	const insertResult = localDb
		.insert(workspaces)
		.values({
			projectId: project.id,
			type: "branch",
			branch,
			name: branch,
			tabOrder: 0,
		})
		.onConflictDoNothing()
		.returning()
		.all();

	const wasExisting = insertResult.length === 0;

	// Only shift existing workspaces if we successfully inserted
	if (!wasExisting) {
		const newWorkspaceId = insertResult[0].id;
		const projectWorkspaces = localDb
			.select()
			.from(workspaces)
			.where(
				and(
					eq(workspaces.projectId, project.id),
					not(eq(workspaces.id, newWorkspaceId)),
					isNull(workspaces.deletingAt),
				),
			)
			.all();

		for (const ws of projectWorkspaces) {
			localDb
				.update(workspaces)
				.set({ tabOrder: ws.tabOrder + 1 })
				.where(eq(workspaces.id, ws.id))
				.run();
		}
	}

	// Get the workspace (either newly created or existing from race condition)
	const workspace = insertResult[0] ?? getBranchWorkspace(project.id);

	if (!workspace) {
		console.warn(
			`[ensureMainWorkspace] Failed to create or find branch workspace for project ${project.id}`,
		);
		return;
	}

	setLastActiveWorkspace(workspace.id);

	if (!wasExisting) {
		activateProject(project);

		track("workspace_opened", {
			workspace_id: workspace.id,
			project_id: project.id,
			type: "branch",
			was_existing: false,
			auto_created: true,
		});
	}
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

	repoSegment = repoSegment.split("?")[0].split("#")[0];
	repoSegment = repoSegment.replace(/\.git$/, "");

	try {
		repoSegment = decodeURIComponent(repoSegment);
	} catch {
		// Invalid encoding, continue with raw value
	}

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
			.query(({ input }): Project => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Project ${input.id} not found`,
					});
				}

				return project;
			}),

		getRecents: publicProcedure.query((): Project[] => {
			return localDb
				.select()
				.from(projects)
				.orderBy(desc(projects.lastOpenedAt))
				.all();
		}),

		getBranches: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(
				async ({
					input,
				}): Promise<{
					branches: Array<{ name: string; lastCommitDate: number }>;
					defaultBranch: string;
				}> => {
					const project = localDb
						.select()
						.from(projects)
						.where(eq(projects.id, input.projectId))
						.get();
					if (!project) {
						throw new Error(`Project ${input.projectId} not found`);
					}

					const git = simpleGit(project.mainRepoPath);

					// Check if origin remote exists
					let hasOrigin = false;
					try {
						const remotes = await git.getRemotes();
						hasOrigin = remotes.some((r) => r.name === "origin");
					} catch {
						// If we can't get remotes, assume no origin
					}

					const branchSummary = await git.branch(["-a"]);

					const localBranches: string[] = [];
					const remoteBranches: string[] = [];

					for (const name of Object.keys(branchSummary.branches)) {
						if (name.startsWith("remotes/origin/")) {
							if (name === "remotes/origin/HEAD") continue;
							const remoteName = name.replace("remotes/origin/", "");
							remoteBranches.push(remoteName);
						} else {
							localBranches.push(name);
						}
					}

					// Get branch dates for sorting
					let branches: Array<{ name: string; lastCommitDate: number }> = [];

					// Determine which ref pattern to use based on whether origin exists
					const refPattern = hasOrigin ? "refs/remotes/origin/" : "refs/heads/";

					try {
						const branchInfo = await git.raw([
							"for-each-ref",
							"--sort=-committerdate",
							"--format=%(refname:short) %(committerdate:unix)",
							refPattern,
						]);

						const seen = new Set<string>();
						for (const line of branchInfo.trim().split("\n")) {
							if (!line) continue;
							const lastSpaceIdx = line.lastIndexOf(" ");
							let branch = line.substring(0, lastSpaceIdx);
							const timestamp = Number.parseInt(
								line.substring(lastSpaceIdx + 1),
								10,
							);

							// Normalize remote branch names
							if (branch.startsWith("origin/")) {
								branch = branch.replace("origin/", "");
							}

							// Skip duplicates and HEAD
							if (seen.has(branch)) continue;
							if (branch === "HEAD") continue;
							seen.add(branch);

							branches.push({
								name: branch,
								lastCommitDate: timestamp * 1000,
							});
						}
					} catch {
						// Fallback: just list branches without dates
						const branchList = hasOrigin ? remoteBranches : localBranches;
						branches = branchList.map((name) => ({ name, lastCommitDate: 0 }));
					}

					// Sync with remote in case the default branch changed (e.g. master -> main)
					const remoteDefaultBranch = await refreshDefaultBranch(
						project.mainRepoPath,
					);

					const defaultBranch =
						remoteDefaultBranch ||
						project.defaultBranch ||
						(await getDefaultBranch(project.mainRepoPath));

					if (defaultBranch !== project.defaultBranch) {
						localDb
							.update(projects)
							.set({ defaultBranch })
							.where(eq(projects.id, input.projectId))
							.run();
					}

					// Sort: default branch first, then by date
					branches.sort((a, b) => {
						if (a.name === defaultBranch) return -1;
						if (b.name === defaultBranch) return 1;
						return b.lastCommitDate - a.lastCommitDate;
					});

					return { branches, defaultBranch };
				},
			),

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
			const project = upsertProject(mainRepoPath, defaultBranch);

			// Auto-create main workspace if it doesn't exist
			await ensureMainWorkspace(project);

			track("project_opened", {
				project_id: project.id,
				method: "open",
			});

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

				const project = upsertProject(input.path, defaultBranch);

				// Auto-create main workspace if it doesn't exist
				await ensureMainWorkspace(project);

				track("project_opened", {
					project_id: project.id,
					method: "init",
				});

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
					const existingProject = localDb
						.select()
						.from(projects)
						.where(eq(projects.mainRepoPath, clonePath))
						.get();

					if (existingProject) {
						// Verify the filesystem path still exists
						try {
							await access(clonePath);
							// Directory exists - update lastOpenedAt and return existing project
							localDb
								.update(projects)
								.set({ lastOpenedAt: Date.now() })
								.where(eq(projects.id, existingProject.id))
								.run();

							// Auto-create main workspace if it doesn't exist
							await ensureMainWorkspace({
								...existingProject,
								lastOpenedAt: Date.now(),
							});

							track("project_opened", {
								project_id: existingProject.id,
								method: "clone",
							});

							return {
								canceled: false as const,
								success: true as const,
								project: { ...existingProject, lastOpenedAt: Date.now() },
							};
						} catch {
							// Directory is missing - remove the stale project record and continue with clone
							localDb
								.delete(projects)
								.where(eq(projects.id, existingProject.id))
								.run();
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
					const project = localDb
						.insert(projects)
						.values({
							mainRepoPath: clonePath,
							name,
							color: getDefaultProjectColor(),
							defaultBranch,
						})
						.returning()
						.get();

					// Auto-create main workspace if it doesn't exist
					await ensureMainWorkspace(project);

					track("project_opened", {
						project_id: project.id,
						method: "clone",
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
			.mutation(({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();
				if (!project) {
					throw new Error(`Project ${input.id} not found`);
				}

				localDb
					.update(projects)
					.set({
						...(input.patch.name !== undefined && { name: input.patch.name }),
						...(input.patch.color !== undefined && {
							color: input.patch.color,
						}),
						lastOpenedAt: Date.now(),
					})
					.where(eq(projects.id, input.id))
					.run();

				return { success: true };
			}),

		reorder: publicProcedure
			.input(
				z.object({
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const { fromIndex, toIndex } = input;

				const activeProjects = localDb
					.select()
					.from(projects)
					.where(eq(projects.tabOrder, projects.tabOrder)) // Just get all with non-null tabOrder
					.all()
					.filter((p) => p.tabOrder !== null)
					.sort((a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0));

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

				for (let i = 0; i < activeProjects.length; i++) {
					localDb
						.update(projects)
						.set({ tabOrder: i })
						.where(eq(projects.id, activeProjects[i].id))
						.run();
				}

				return { success: true };
			}),

		refreshDefaultBranch: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					throw new Error(`Project ${input.id} not found`);
				}

				const remoteDefaultBranch = await refreshDefaultBranch(
					project.mainRepoPath,
				);

				if (
					remoteDefaultBranch &&
					remoteDefaultBranch !== project.defaultBranch
				) {
					localDb
						.update(projects)
						.set({ defaultBranch: remoteDefaultBranch })
						.where(eq(projects.id, input.id))
						.run();

					return {
						success: true,
						defaultBranch: remoteDefaultBranch,
						changed: true,
						previousBranch: project.defaultBranch,
					};
				}

				// Ensure we always return a valid default branch
				const defaultBranch =
					project.defaultBranch ??
					remoteDefaultBranch ??
					(await getDefaultBranch(project.mainRepoPath));

				return {
					success: true,
					defaultBranch,
					changed: false,
				};
			}),

		close: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					throw new Error("Project not found");
				}

				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, input.id))
					.all();

				let totalFailed = 0;
				for (const workspace of projectWorkspaces) {
					const terminalResult = await terminalManager.killByWorkspaceId(
						workspace.id,
					);
					totalFailed += terminalResult.failed;
				}

				const closedWorkspaceIds = projectWorkspaces.map((w) => w.id);

				if (closedWorkspaceIds.length > 0) {
					localDb
						.delete(workspaces)
						.where(inArray(workspaces.id, closedWorkspaceIds))
						.run();
				}

				// Hide the project by setting tabOrder to null
				localDb
					.update(projects)
					.set({ tabOrder: null })
					.where(eq(projects.id, input.id))
					.run();

				// Update active workspace if it was in this project
				const currentSettings = localDb.select().from(settings).get();
				if (
					currentSettings?.lastActiveWorkspaceId &&
					closedWorkspaceIds.includes(currentSettings.lastActiveWorkspaceId)
				) {
					const remainingWorkspaces = localDb
						.select()
						.from(workspaces)
						.orderBy(desc(workspaces.lastOpenedAt))
						.all();

					localDb
						.update(settings)
						.set({
							lastActiveWorkspaceId: remainingWorkspaces[0]?.id ?? null,
						})
						.where(eq(settings.id, 1))
						.run();
				}

				const terminalWarning =
					totalFailed > 0
						? `${totalFailed} terminal process(es) may still be running`
						: undefined;

				track("project_closed", { project_id: input.id });

				return { success: true, terminalWarning };
			}),

		getGitHubAvatar: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.id))
					.get();

				if (!project) {
					console.log("[getGitHubAvatar] Project not found:", input.id);
					return null;
				}

				if (project.githubOwner) {
					console.log(
						"[getGitHubAvatar] Using cached owner:",
						project.githubOwner,
					);
					return {
						owner: project.githubOwner,
						avatarUrl: getGitHubAvatarUrl(project.githubOwner),
					};
				}

				console.log(
					"[getGitHubAvatar] Fetching owner for:",
					project.mainRepoPath,
				);
				const owner = await fetchGitHubOwner(project.mainRepoPath);

				if (!owner) {
					console.log("[getGitHubAvatar] Failed to fetch owner");
					return null;
				}

				console.log("[getGitHubAvatar] Fetched owner:", owner);

				localDb
					.update(projects)
					.set({ githubOwner: owner })
					.where(eq(projects.id, input.id))
					.run();

				return {
					owner,
					avatarUrl: getGitHubAvatarUrl(owner),
				};
			}),
	});
};

export type ProjectsRouter = ReturnType<typeof createProjectsRouter>;
