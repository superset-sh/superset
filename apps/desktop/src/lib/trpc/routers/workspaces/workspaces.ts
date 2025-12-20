import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "main/lib/db";
import { terminalManager } from "main/lib/terminal";
import { nanoid } from "nanoid";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	branchExistsOnRemote,
	checkNeedsRebase,
	createWorktree,
	detectBaseBranch,
	fetchDefaultBranch,
	generateBranchName,
	getCurrentBranch,
	getDefaultBranch,
	hasOriginRemote,
	hasUncommittedChanges,
	hasUnpushedCommits,
	listBranches,
	removeWorktree,
	safeCheckoutBranch,
	worktreeExists,
} from "./utils/git";
import { fetchGitHubPRStatus } from "./utils/github";
import { loadSetupConfig } from "./utils/setup";
import { runTeardown } from "./utils/teardown";
import { getWorkspacePath } from "./utils/worktree";

export const createWorkspacesRouter = () => {
	return router({
		create: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
					branchName: z.string().optional(),
					baseBranch: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branch = input.branchName?.trim() || generateBranchName();

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

				// Use provided baseBranch or fall back to default
				const targetBranch = input.baseBranch || defaultBranch;

				// Check if this repo has a remote origin
				const hasRemote = await hasOriginRemote(project.mainRepoPath);

				// Determine the start point for the worktree
				let startPoint: string;
				if (hasRemote) {
					// Verify the branch exists on remote before attempting to use it
					const existsOnRemote = await branchExistsOnRemote(
						project.mainRepoPath,
						targetBranch,
					);
					if (!existsOnRemote) {
						throw new Error(
							`Branch "${targetBranch}" does not exist on origin. Please select a different base branch.`,
						);
					}

					// Fetch the target branch to ensure we're branching from latest (best-effort)
					try {
						await fetchDefaultBranch(project.mainRepoPath, targetBranch);
					} catch {
						// Silently continue - branch exists on remote, just couldn't fetch
					}
					startPoint = `origin/${targetBranch}`;
				} else {
					// For local-only repos, use the local branch
					startPoint = targetBranch;
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
					baseBranch: targetBranch,
					createdAt: Date.now(),
					gitStatus: {
						branch,
						needsRebase: false, // Fresh off base branch, doesn't need rebase
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
					type: "worktree" as const,
					branch,
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

		createBranchWorkspace: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					branch: z.string().optional(), // If not provided, uses current branch
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				// Determine the branch - use provided or get current
				const branch =
					input.branch || (await getCurrentBranch(project.mainRepoPath));
				if (!branch) {
					throw new Error("Could not determine current branch");
				}

				// If a specific branch was requested, check for conflict before checkout
				if (input.branch) {
					const existingBranchWorkspace = db.data.workspaces.find(
						(w) => w.projectId === input.projectId && w.type === "branch",
					);
					if (
						existingBranchWorkspace &&
						existingBranchWorkspace.branch !== branch
					) {
						throw new Error(
							`A main workspace already exists on branch "${existingBranchWorkspace.branch}". ` +
								`Use the branch switcher to change branches.`,
						);
					}
					await safeCheckoutBranch(project.mainRepoPath, input.branch);
				}

				// Prepare new workspace (may not be used if existing found)
				const workspace = {
					id: nanoid(),
					projectId: input.projectId,
					worktreeId: undefined,
					type: "branch" as const,
					branch,
					name: branch, // Name is always the branch for branch workspaces
					tabOrder: 0, // Main workspace is always first
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastOpenedAt: Date.now(),
				};

				// Track which workspace "wins" - makes concurrent calls idempotent
				let returnedWorkspace: typeof workspace = workspace;
				let wasExisting = false;

				await db.update((data) => {
					// Atomic check: if branch workspace already exists, activate it
					const existing = data.workspaces.find(
						(w) => w.projectId === input.projectId && w.type === "branch",
					);

					if (existing) {
						wasExisting = true;
						returnedWorkspace = existing as typeof workspace;
						data.settings.lastActiveWorkspaceId = existing.id;
						existing.lastOpenedAt = Date.now();
						return;
					}

					// Create new workspace - shift existing ones to make room at front
					for (const ws of data.workspaces) {
						if (ws.projectId === input.projectId) {
							ws.tabOrder += 1;
						}
					}
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

				return {
					workspace: returnedWorkspace,
					worktreePath: project.mainRepoPath,
					projectId: project.id,
					wasExisting,
				};
			}),

		getBranches: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					fetch: z.boolean().optional(), // Whether to fetch remote refs (default: false, avoids UI stalls)
				}),
			)
			.query(async ({ input }) => {
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branches = await listBranches(project.mainRepoPath, {
					fetch: input.fetch,
				});

				// Get branches that are in use by worktrees, with their workspace IDs
				const projectWorkspaces = db.data.workspaces.filter(
					(w) => w.projectId === input.projectId,
				);
				const worktreeBranchMap: Record<string, string> = {};
				for (const ws of projectWorkspaces) {
					if (ws.type === "worktree" && ws.branch) {
						worktreeBranchMap[ws.branch] = ws.id;
					}
				}

				return {
					...branches,
					inUse: Object.keys(worktreeBranchMap),
					inUseWorkspaces: worktreeBranchMap, // branch -> workspaceId
				};
			}),

		// Switch an existing branch workspace to a different branch
		switchBranchWorkspace: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const workspace = db.data.workspaces.find(
					(w) => w.projectId === input.projectId && w.type === "branch",
				);
				if (!workspace) {
					throw new Error("No branch workspace found for this project");
				}

				// Checkout the new branch with safety checks (terminals continue running on the new branch)
				await safeCheckoutBranch(project.mainRepoPath, input.branch);

				// Send newline to terminals so their prompts refresh with new branch
				terminalManager.refreshPromptsForWorkspace(workspace.id);

				// Update the workspace - name is always the branch for branch workspaces
				await db.update((data) => {
					const ws = data.workspaces.find((w) => w.id === workspace.id);
					if (ws) {
						ws.branch = input.branch;
						ws.name = input.branch; // Name is always the branch
						ws.updatedAt = Date.now();
						ws.lastOpenedAt = Date.now();
					}
					data.settings.lastActiveWorkspaceId = workspace.id;
				});

				const updatedWorkspace = db.data.workspaces.find(
					(w) => w.id === workspace.id,
				);
				if (!updatedWorkspace) {
					throw new Error(`Workspace ${workspace.id} not found after update`);
				}

				return {
					workspace: updatedWorkspace,
					worktreePath: project.mainRepoPath,
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
						worktreeId?: string;
						worktreePath: string;
						type: "worktree" | "branch";
						branch: string;
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
						worktreePath: getWorkspacePath(workspace) ?? "",
					});
				}
			}

			return Array.from(groupsMap.values()).sort(
				(a, b) => a.project.tabOrder - b.project.tabOrder,
			);
		}),

		getActive: publicProcedure.query(async () => {
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
			const worktree = workspace.worktreeId
				? db.data.worktrees.find((wt) => wt.id === workspace.worktreeId)
				: null;

			// Detect and persist base branch for existing worktrees that don't have it
			// We use undefined to mean "not yet attempted" and null to mean "attempted but not found"
			let baseBranch = worktree?.baseBranch;
			if (worktree && baseBranch === undefined && project) {
				// Only attempt detection if there's a remote origin
				const hasRemote = await hasOriginRemote(project.mainRepoPath);
				if (hasRemote) {
					try {
						const defaultBranch = project.defaultBranch || "main";
						const detected = await detectBaseBranch(
							worktree.path,
							worktree.branch,
							defaultBranch,
						);
						if (detected) {
							baseBranch = detected;
						}
						// Persist the result (detected branch or null sentinel)
						await db.update((data) => {
							const wt = data.worktrees.find((w) => w.id === worktree.id);
							if (wt) {
								wt.baseBranch = detected ?? null;
							}
						});
					} catch {
						// Detection failed, persist null to avoid retrying
						await db.update((data) => {
							const wt = data.worktrees.find((w) => w.id === worktree.id);
							if (wt) {
								wt.baseBranch = null;
							}
						});
					}
				} else {
					// No remote - persist null to avoid retrying
					await db.update((data) => {
						const wt = data.worktrees.find((w) => w.id === worktree.id);
						if (wt) {
							wt.baseBranch = null;
						}
					});
				}
			}

			return {
				...workspace,
				worktreePath: getWorkspacePath(workspace) ?? "",
				project: project
					? {
							id: project.id,
							name: project.name,
							mainRepoPath: project.mainRepoPath,
						}
					: null,
				worktree: worktree
					? {
							branch: worktree.branch,
							baseBranch,
							gitStatus: worktree.gitStatus,
						}
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

				// Branch workspaces are non-destructive to close - no git checks needed
				if (workspace.type === "branch") {
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

				const worktree = workspace.worktreeId
					? db.data.worktrees.find((wt) => wt.id === workspace.worktreeId)
					: null;
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

				const project = db.data.projects.find(
					(p) => p.id === workspace.projectId,
				);

				let teardownError: string | undefined;
				let worktree: (typeof db.data.worktrees)[0] | undefined;

				// Branch workspaces don't have worktrees - skip worktree operations
				if (workspace.type === "worktree" && workspace.worktreeId) {
					worktree = db.data.worktrees.find(
						(wt) => wt.id === workspace.worktreeId,
					);

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
				}

				// Proceed with DB cleanup
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

		getWorktreesByProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const worktrees = db.data.worktrees.filter(
					(wt) => wt.projectId === input.projectId,
				);

				return worktrees.map((wt) => {
					const workspace = db.data.workspaces.find(
						(w) => w.worktreeId === wt.id,
					);
					return {
						...wt,
						hasActiveWorkspace: workspace !== undefined,
						workspace: workspace ?? null,
					};
				});
			}),

		openWorktree: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const worktree = db.data.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree) {
					throw new Error(`Worktree ${input.worktreeId} not found`);
				}

				// Check if worktree already has an active workspace
				const existingWorkspace = db.data.workspaces.find(
					(w) => w.worktreeId === input.worktreeId,
				);
				if (existingWorkspace) {
					throw new Error("Worktree already has an active workspace");
				}

				const project = db.data.projects.find(
					(p) => p.id === worktree.projectId,
				);
				if (!project) {
					throw new Error(`Project ${worktree.projectId} not found`);
				}

				// Verify worktree still exists on disk
				const exists = await worktreeExists(
					project.mainRepoPath,
					worktree.path,
				);
				if (!exists) {
					throw new Error("Worktree no longer exists on disk");
				}

				const projectWorkspaces = db.data.workspaces.filter(
					(w) => w.projectId === worktree.projectId,
				);
				const maxTabOrder =
					projectWorkspaces.length > 0
						? Math.max(...projectWorkspaces.map((w) => w.tabOrder))
						: -1;

				const workspace = {
					id: nanoid(),
					projectId: worktree.projectId,
					worktreeId: worktree.id,
					type: "worktree" as const,
					branch: worktree.branch,
					name: input.name ?? worktree.branch,
					tabOrder: maxTabOrder + 1,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastOpenedAt: Date.now(),
				};

				await db.update((data) => {
					data.workspaces.push(workspace);
					data.settings.lastActiveWorkspaceId = workspace.id;

					const p = data.projects.find((p) => p.id === worktree.projectId);
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

				// Load setup configuration from the main repo
				const setupConfig = loadSetupConfig(project.mainRepoPath);

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath: worktree.path,
					projectId: project.id,
				};
			}),

		close: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);

				if (!workspace) {
					throw new Error("Workspace not found");
				}

				// Kill all terminal processes in this workspace
				const terminalResult = await terminalManager.killByWorkspaceId(
					input.id,
				);

				// Delete workspace record ONLY, keep worktree
				await db.update((data) => {
					data.workspaces = data.workspaces.filter((w) => w.id !== input.id);

					// Check if project should be hidden (no more open workspaces)
					const remainingWorkspaces = data.workspaces.filter(
						(w) => w.projectId === workspace.projectId,
					);
					if (remainingWorkspaces.length === 0) {
						const p = data.projects.find((p) => p.id === workspace.projectId);
						if (p) {
							p.tabOrder = null;
						}
					}

					// Update active workspace if this was the active one
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

				return { success: true, terminalWarning };
			}),
	});
};

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
