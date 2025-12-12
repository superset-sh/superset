import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "main/lib/db";
import { terminalManager } from "main/lib/terminal";
import { nanoid } from "nanoid";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	checkNeedsRebase,
	createWorktree,
	fetchDefaultBranch,
	generateBranchName,
	getDefaultBranch,
	hasOriginRemote,
	hasUncommittedChanges,
	hasUnpushedCommits,
	removeWorktree,
	worktreeExists,
} from "./utils/git";
import { fetchGitHubPRStatus } from "./utils/github";
import { loadSetupConfig } from "./utils/setup";
import { runTeardown } from "./utils/teardown";
import { getWorktreePath } from "./utils/worktree";

export const createWorkspacesRouter = () => {
	return router({
		create: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branch = generateBranchName();

				const worktreePath = join(
					homedir(),
					SUPERSET_DIR_NAME,
					WORKTREES_DIR_NAME,
					project.name,
					branch,
				);

				// Get default branch (lazy migration for existing projects without defaultBranch)
				let defaultBranch = project.defaultBranch;
				if (!defaultBranch) {
					defaultBranch = await getDefaultBranch(project.mainRepoPath);
					// Save it for future use
					await db.update((data) => {
						const p = data.projects.find((p) => p.id === project.id);
						if (p) p.defaultBranch = defaultBranch;
					});
				}

				// Check if this repo has a remote origin
				const hasRemote = await hasOriginRemote(project.mainRepoPath);

				// Determine the start point for the worktree
				let startPoint: string;
				if (hasRemote) {
					// Fetch default branch to ensure we're branching from latest (best-effort)
					try {
						await fetchDefaultBranch(project.mainRepoPath, defaultBranch);
					} catch {
						// Silently continue - branch still exists locally, just might be stale
					}
					startPoint = `origin/${defaultBranch}`;
				} else {
					// For local-only repos, use the local default branch
					startPoint = defaultBranch;
				}

				await createWorktree(
					project.mainRepoPath,
					branch,
					worktreePath,
					startPoint,
				);

				const worktree = {
					id: nanoid(),
					projectId: input.projectId,
					path: worktreePath,
					branch,
					createdAt: Date.now(),
					gitStatus: {
						branch,
						needsRebase: false, // Fresh off main, doesn't need rebase
						lastRefreshed: Date.now(),
					},
				};

				const projectWorkspaces = db.data.workspaces.filter(
					(w) => w.projectId === input.projectId,
				);
				const maxTabOrder =
					projectWorkspaces.length > 0
						? Math.max(...projectWorkspaces.map((w) => w.tabOrder))
						: -1;

				const workspace = {
					id: nanoid(),
					projectId: input.projectId,
					worktreeId: worktree.id,
					name: input.name ?? branch,
					tabOrder: maxTabOrder + 1,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastOpenedAt: Date.now(),
				};

				await db.update((data) => {
					data.worktrees.push(worktree);
					data.workspaces.push(workspace);
					data.settings.lastActiveWorkspaceId = workspace.id;

					const p = data.projects.find((p) => p.id === input.projectId);
					if (p) {
						p.lastOpenedAt = Date.now();

						if (p.tabOrder === null) {
							const activeProjects = data.projects.filter(
								(proj) => proj.tabOrder !== null,
							);
							const maxProjectTabOrder =
								activeProjects.length > 0
									? // biome-ignore lint/style/noNonNullAssertion: filter guarantees tabOrder is not null
										Math.max(...activeProjects.map((proj) => proj.tabOrder!))
									: -1;
							p.tabOrder = maxProjectTabOrder + 1;
						}
					}
				});

				// Load setup configuration from the main repo (where .superset/config.json lives)
				const setupConfig = loadSetupConfig(project.mainRepoPath);

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath,
					projectId: project.id,
				};
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);
				if (!workspace) {
					throw new Error(`Workspace ${input.id} not found`);
				}
				return workspace;
			}),

		getAll: publicProcedure.query(() => {
			return db.data.workspaces.slice().sort((a, b) => a.tabOrder - b.tabOrder);
		}),

		getAllGrouped: publicProcedure.query(() => {
			const activeProjects = db.data.projects.filter(
				(p) => p.tabOrder !== null,
			);

			const groupsMap = new Map<
				string,
				{
					project: {
						id: string;
						name: string;
						color: string;
						tabOrder: number;
					};
					workspaces: Array<{
						id: string;
						projectId: string;
						worktreeId: string;
						worktreePath: string;
						name: string;
						tabOrder: number;
						createdAt: number;
						updatedAt: number;
						lastOpenedAt: number;
					}>;
				}
			>();

			for (const project of activeProjects) {
				groupsMap.set(project.id, {
					project: {
						id: project.id,
						name: project.name,
						color: project.color,
						// biome-ignore lint/style/noNonNullAssertion: filter guarantees tabOrder is not null
						tabOrder: project.tabOrder!,
					},
					workspaces: [],
				});
			}

			const workspaces = db.data.workspaces
				.slice()
				.sort((a, b) => a.tabOrder - b.tabOrder);

			for (const workspace of workspaces) {
				if (groupsMap.has(workspace.projectId)) {
					groupsMap.get(workspace.projectId)?.workspaces.push({
						...workspace,
						worktreePath: getWorktreePath(workspace.worktreeId) ?? "",
					});
				}
			}

			return Array.from(groupsMap.values()).sort(
				(a, b) => a.project.tabOrder - b.project.tabOrder,
			);
		}),

		getActive: publicProcedure.query(() => {
			const { lastActiveWorkspaceId } = db.data.settings;

			if (!lastActiveWorkspaceId) {
				return null;
			}

			const workspace = db.data.workspaces.find(
				(w) => w.id === lastActiveWorkspaceId,
			);
			if (!workspace) {
				throw new Error(
					`Active workspace ${lastActiveWorkspaceId} not found in database`,
				);
			}

			const project = db.data.projects.find(
				(p) => p.id === workspace.projectId,
			);
			const worktree = db.data.worktrees.find(
				(wt) => wt.id === workspace.worktreeId,
			);

			return {
				...workspace,
				worktreePath: getWorktreePath(workspace.worktreeId) ?? "",
				project: project
					? {
							id: project.id,
							name: project.name,
							mainRepoPath: project.mainRepoPath,
						}
					: null,
				worktree: worktree
					? { branch: worktree.branch, gitStatus: worktree.gitStatus }
					: null,
			};
		}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().optional(),
					}),
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const workspace = data.workspaces.find((w) => w.id === input.id);
					if (!workspace) {
						throw new Error(`Workspace ${input.id} not found`);
					}

					if (input.patch.name !== undefined) {
						workspace.name = input.patch.name;
					}

					workspace.updatedAt = Date.now();
					workspace.lastOpenedAt = Date.now();
				});

				return { success: true };
			}),

		canDelete: publicProcedure
			.input(
				z.object({
					id: z.string(),
					// Skip expensive git checks (status, unpushed) during polling - only check terminal count
					skipGitChecks: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);

				if (!workspace) {
					return {
						canDelete: false,
						reason: "Workspace not found",
						workspace: null,
						activeTerminalCount: 0,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				const activeTerminalCount =
					terminalManager.getSessionCountByWorkspaceId(input.id);

				// If skipping git checks, return early with just terminal count
				// This is used during polling to avoid expensive git operations
				if (input.skipGitChecks) {
					return {
						canDelete: true,
						reason: null,
						workspace,
						warning: null,
						activeTerminalCount,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				const project = db.data.projects.find(
					(p) => p.id === workspace.projectId,
				);

				if (worktree && project) {
					try {
						const exists = await worktreeExists(
							project.mainRepoPath,
							worktree.path,
						);

						if (!exists) {
							return {
								canDelete: true,
								reason: null,
								workspace,
								warning:
									"Worktree not found in git (may have been manually removed)",
								activeTerminalCount,
								hasChanges: false,
								hasUnpushedCommits: false,
							};
						}

						// Check for uncommitted changes and unpushed commits in parallel
						const [hasChanges, unpushedCommits] = await Promise.all([
							hasUncommittedChanges(worktree.path),
							hasUnpushedCommits(worktree.path),
						]);

						return {
							canDelete: true,
							reason: null,
							workspace,
							warning: null,
							activeTerminalCount,
							hasChanges,
							hasUnpushedCommits: unpushedCommits,
						};
					} catch (error) {
						return {
							canDelete: false,
							reason: `Failed to check worktree status: ${error instanceof Error ? error.message : String(error)}`,
							workspace,
							activeTerminalCount,
							hasChanges: false,
							hasUnpushedCommits: false,
						};
					}
				}

				return {
					canDelete: true,
					reason: null,
					workspace,
					warning: "No associated worktree found",
					activeTerminalCount,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);

				if (!workspace) {
					return { success: false, error: "Workspace not found" };
				}

				// Kill all terminal processes in this workspace first
				const terminalResult = await terminalManager.killByWorkspaceId(
					input.id,
				);

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				const project = db.data.projects.find(
					(p) => p.id === workspace.projectId,
				);

				let teardownError: string | undefined;

				if (worktree && project) {
					// Run teardown scripts before removing worktree
					const exists = await worktreeExists(
						project.mainRepoPath,
						worktree.path,
					);

					if (exists) {
						const teardownResult = runTeardown(
							project.mainRepoPath,
							worktree.path,
							workspace.name,
						);
						if (!teardownResult.success) {
							teardownError = teardownResult.error;
						}
					}

					try {
						if (exists) {
							await removeWorktree(project.mainRepoPath, worktree.path);
						} else {
							console.warn(
								`Worktree ${worktree.path} not found in git, skipping removal`,
							);
						}
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						console.error("Failed to remove worktree:", errorMessage);
						return {
							success: false,
							error: `Failed to remove worktree: ${errorMessage}`,
						};
					}
				}

				// Only proceed with DB cleanup if worktree was successfully removed (or doesn't exist)
				await db.update((data) => {
					data.workspaces = data.workspaces.filter((w) => w.id !== input.id);

					if (worktree) {
						data.worktrees = data.worktrees.filter(
							(wt) => wt.id !== worktree.id,
						);
					}

					if (project) {
						const remainingWorkspaces = data.workspaces.filter(
							(w) => w.projectId === workspace.projectId,
						);
						if (remainingWorkspaces.length === 0) {
							const p = data.projects.find((p) => p.id === workspace.projectId);
							if (p) {
								p.tabOrder = null;
							}
						}
					}

					if (data.settings.lastActiveWorkspaceId === input.id) {
						const sorted = data.workspaces
							.slice()
							.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
						data.settings.lastActiveWorkspaceId = sorted[0]?.id || undefined;
					}
				});

				const terminalWarning =
					terminalResult.failed > 0
						? `${terminalResult.failed} terminal process(es) may still be running`
						: undefined;

				return { success: true, teardownError, terminalWarning };
			}),

		setActive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const workspace = data.workspaces.find((w) => w.id === input.id);
					if (!workspace) {
						throw new Error(`Workspace ${input.id} not found`);
					}

					data.settings.lastActiveWorkspaceId = input.id;
					workspace.lastOpenedAt = Date.now();
					workspace.updatedAt = Date.now();
				});

				return { success: true };
			}),

		reorder: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const { projectId, fromIndex, toIndex } = input;

					const projectWorkspaces = data.workspaces
						.filter((w) => w.projectId === projectId)
						.sort((a, b) => a.tabOrder - b.tabOrder);

					if (
						fromIndex < 0 ||
						fromIndex >= projectWorkspaces.length ||
						toIndex < 0 ||
						toIndex >= projectWorkspaces.length
					) {
						throw new Error("Invalid fromIndex or toIndex");
					}

					const [removed] = projectWorkspaces.splice(fromIndex, 1);
					projectWorkspaces.splice(toIndex, 0, removed);

					projectWorkspaces.forEach((workspace, index) => {
						const ws = data.workspaces.find((w) => w.id === workspace.id);
						if (ws) {
							ws.tabOrder = index;
						}
					});
				});

				return { success: true };
			}),

		refreshGitStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = db.data.workspaces.find(
					(w) => w.id === input.workspaceId,
				);
				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				if (!worktree) {
					throw new Error(
						`Worktree for workspace ${input.workspaceId} not found`,
					);
				}

				const project = db.data.projects.find(
					(p) => p.id === workspace.projectId,
				);
				if (!project) {
					throw new Error(`Project ${workspace.projectId} not found`);
				}

				// Get default branch (lazy migration for existing projects without defaultBranch)
				let defaultBranch = project.defaultBranch;
				if (!defaultBranch) {
					defaultBranch = await getDefaultBranch(project.mainRepoPath);
					// Save it for future use
					await db.update((data) => {
						const p = data.projects.find((p) => p.id === project.id);
						if (p) p.defaultBranch = defaultBranch;
					});
				}

				// Fetch default branch to get latest
				await fetchDefaultBranch(project.mainRepoPath, defaultBranch);

				// Check if worktree branch is behind origin/{defaultBranch}
				const needsRebase = await checkNeedsRebase(
					worktree.path,
					defaultBranch,
				);

				const gitStatus = {
					branch: worktree.branch,
					needsRebase,
					lastRefreshed: Date.now(),
				};

				// Update worktree in db
				await db.update((data) => {
					const wt = data.worktrees.find((w) => w.id === worktree.id);
					if (wt) {
						wt.gitStatus = gitStatus;
					}
				});

				return { gitStatus };
			}),

		getGitHubStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = db.data.workspaces.find(
					(w) => w.id === input.workspaceId,
				);
				if (!workspace) {
					return null;
				}

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				if (!worktree) {
					return null;
				}

				// Always fetch fresh data on hover
				const freshStatus = await fetchGitHubPRStatus(worktree.path);

				// Update cache if we got data
				if (freshStatus) {
					await db.update((data) => {
						const wt = data.worktrees.find((w) => w.id === worktree.id);
						if (wt) {
							wt.githubStatus = freshStatus;
						}
					});
				}

				return freshStatus;
			}),

		getWorktreeInfo: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const workspace = db.data.workspaces.find(
					(w) => w.id === input.workspaceId,
				);
				if (!workspace) {
					return null;
				}

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				if (!worktree) {
					return null;
				}

				// Extract worktree name from path (last segment)
				const worktreeName = worktree.path.split("/").pop() ?? worktree.branch;

				return {
					worktreeName,
					createdAt: worktree.createdAt,
					gitStatus: worktree.gitStatus ?? null,
					githubStatus: worktree.githubStatus ?? null,
				};
			}),
	});
};

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
