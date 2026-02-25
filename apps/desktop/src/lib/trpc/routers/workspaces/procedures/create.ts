import { projects, settings, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull, not } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import { applyBranchPrefix } from "shared/utils/branch";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { resolveWorkspaceBaseBranch } from "../utils/base-branch";
import { setBranchBaseConfig } from "../utils/base-branch-config";
import {
	activateProject,
	findOrphanedWorktreeByBranch,
	findWorktreeWorkspaceByBranch,
	getBranchWorkspace,
	getMaxWorkspaceTabOrder,
	getProject,
	getWorktree,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../utils/db-helpers";
import {
	createWorktreeFromPr,
	generateBranchName,
	getBranchPrefix,
	getBranchWorktreePath,
	getCurrentBranch,
	getPrInfo,
	getPrLocalBranchName,
	listBranches,
	listExternalWorktrees,
	type PullRequestInfo,
	parsePrUrl,
	safeCheckoutBranch,
	sanitizeAuthorPrefix,
	sanitizeBranchName,
	worktreeExists,
} from "../utils/git";
import { resolveWorktreePath } from "../utils/resolve-worktree-path";
import { copySupersetConfigToWorktree, loadSetupConfig } from "../utils/setup";
import { initializeWorkspaceWorktree } from "../utils/workspace-init";

interface CreateWorkspaceFromWorktreeParams {
	projectId: string;
	worktreeId: string;
	branch: string;
	name: string;
}

function createWorkspaceFromWorktree({
	projectId,
	worktreeId,
	branch,
	name,
}: CreateWorkspaceFromWorktreeParams) {
	const maxTabOrder = getMaxWorkspaceTabOrder(projectId);

	const workspace = localDb
		.insert(workspaces)
		.values({
			projectId,
			worktreeId,
			type: "worktree",
			branch,
			name,
			tabOrder: maxTabOrder + 1,
		})
		.returning()
		.get();

	setLastActiveWorkspace(workspace.id);

	return workspace;
}

function getPrWorkspaceName(prInfo: PullRequestInfo): string {
	return prInfo.title || `PR #${prInfo.number}`;
}

interface PrWorkspaceResult {
	workspace: typeof workspaces.$inferSelect;
	initialCommands: string[] | null;
	worktreePath: string;
	projectId: string;
	prNumber: number;
	prTitle: string;
	wasExisting: boolean;
}

interface HandleExistingWorktreeParams {
	existingWorktree: typeof worktrees.$inferSelect;
	project: typeof projects.$inferSelect;
	prInfo: PullRequestInfo;
	localBranchName: string;
	workspaceName: string;
}

function handleExistingWorktree({
	existingWorktree,
	project,
	prInfo,
	localBranchName,
	workspaceName,
}: HandleExistingWorktreeParams): PrWorkspaceResult {
	const existingWorkspace = localDb
		.select()
		.from(workspaces)
		.where(
			and(
				eq(workspaces.worktreeId, existingWorktree.id),
				isNull(workspaces.deletingAt),
			),
		)
		.get();

	if (existingWorkspace) {
		touchWorkspace(existingWorkspace.id);
		setLastActiveWorkspace(existingWorkspace.id);

		return {
			workspace: existingWorkspace,
			initialCommands: null,
			worktreePath: existingWorktree.path,
			projectId: project.id,
			prNumber: prInfo.number,
			prTitle: prInfo.title,
			wasExisting: true,
		};
	}

	const workspace = createWorkspaceFromWorktree({
		projectId: project.id,
		worktreeId: existingWorktree.id,
		branch: localBranchName,
		name: workspaceName,
	});

	activateProject(project);

	track("workspace_opened", {
		workspace_id: workspace.id,
		project_id: project.id,
		type: "worktree",
		source: "pr",
		pr_number: prInfo.number,
	});

	const setupConfig = loadSetupConfig({
		mainRepoPath: project.mainRepoPath,
		worktreePath: existingWorktree.path,
		projectId: project.id,
	});

	return {
		workspace,
		initialCommands: setupConfig?.setup || null,
		worktreePath: existingWorktree.path,
		projectId: project.id,
		prNumber: prInfo.number,
		prTitle: prInfo.title,
		wasExisting: true,
	};
}

interface HandleNewWorktreeParams {
	project: typeof projects.$inferSelect;
	prInfo: PullRequestInfo;
	localBranchName: string;
	workspaceName: string;
}

async function getKnownBranchesSafe(
	repoPath: string,
): Promise<string[] | undefined> {
	try {
		const { local, remote } = await listBranches(repoPath);
		return [...local, ...remote];
	} catch (error) {
		console.warn(
			`[workspaces/create] Failed to list branches for ${repoPath}:`,
			error,
		);
		return undefined;
	}
}

async function handleNewWorktree({
	project,
	prInfo,
	localBranchName,
	workspaceName,
}: HandleNewWorktreeParams): Promise<PrWorkspaceResult> {
	const existingWorktreePath = await getBranchWorktreePath({
		mainRepoPath: project.mainRepoPath,
		branch: localBranchName,
	});
	if (existingWorktreePath) {
		throw new Error(
			`This PR's branch is already checked out in a worktree at: ${existingWorktreePath}`,
		);
	}

	const worktreePath = resolveWorktreePath(project, localBranchName);

	await createWorktreeFromPr({
		mainRepoPath: project.mainRepoPath,
		worktreePath,
		prInfo,
		localBranchName,
	});

	const knownBranches = await getKnownBranchesSafe(project.mainRepoPath);
	const baseBranch = resolveWorkspaceBaseBranch({
		workspaceBaseBranch: project.workspaceBaseBranch,
		defaultBranch: project.defaultBranch,
		knownBranches,
	});

	const worktree = localDb
		.insert(worktrees)
		.values({
			projectId: project.id,
			path: worktreePath,
			branch: localBranchName,
			baseBranch,
			gitStatus: null,
		})
		.returning()
		.get();

	const workspace = createWorkspaceFromWorktree({
		projectId: project.id,
		worktreeId: worktree.id,
		branch: localBranchName,
		name: workspaceName,
	});

	activateProject(project);

	track("workspace_created", {
		workspace_id: workspace.id,
		project_id: project.id,
		branch: localBranchName,
		base_branch: baseBranch,
		source: "pr",
		pr_number: prInfo.number,
		is_fork: prInfo.isCrossRepository,
	});

	await setBranchBaseConfig({
		repoPath: project.mainRepoPath,
		branch: localBranchName,
		baseBranch,
		isExplicit: false,
	});

	workspaceInitManager.startJob(workspace.id, project.id);
	initializeWorkspaceWorktree({
		workspaceId: workspace.id,
		projectId: project.id,
		worktreeId: worktree.id,
		worktreePath,
		branch: localBranchName,
		mainRepoPath: project.mainRepoPath,
		useExistingBranch: true,
		skipWorktreeCreation: true,
	});

	const setupConfig = loadSetupConfig({
		mainRepoPath: project.mainRepoPath,
		worktreePath,
		projectId: project.id,
	});

	return {
		workspace,
		initialCommands: setupConfig?.setup || null,
		worktreePath,
		projectId: project.id,
		prNumber: prInfo.number,
		prTitle: prInfo.title,
		wasExisting: false,
	};
}

export const createCreateProcedures = () => {
	return router({
		create: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
					branchName: z.string().optional(),
					baseBranch: z.string().optional(),
					useExistingBranch: z.boolean().optional(),
					applyPrefix: z.boolean().optional().default(true),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				let existingBranchName: string | undefined;
				if (input.useExistingBranch) {
					existingBranchName = input.branchName?.trim();
					if (!existingBranchName) {
						throw new Error(
							"Branch name is required when using an existing branch",
						);
					}

					const existingWorktreePath = await getBranchWorktreePath({
						mainRepoPath: project.mainRepoPath,
						branch: existingBranchName,
					});
					if (existingWorktreePath) {
						throw new Error(
							`Branch "${existingBranchName}" is already checked out in another worktree at: ${existingWorktreePath}`,
						);
					}
				}

				const { local, remote } = await listBranches(project.mainRepoPath);
				const existingBranches = [...local, ...remote];

				let branchPrefix: string | undefined;
				let branchSeparator: string | undefined;
				if (input.applyPrefix) {
					const globalSettings = localDb.select().from(settings).get();
					const projectOverrides = project.branchPrefixMode != null;
					const prefixMode = projectOverrides
						? project.branchPrefixMode
						: (globalSettings?.branchPrefixMode ?? "none");
					const customPrefix = projectOverrides
						? project.branchPrefixCustom
						: globalSettings?.branchPrefixCustom;
					const separator = projectOverrides
						? (project.branchPrefixSeparator ??
							globalSettings?.branchPrefixSeparator)
						: globalSettings?.branchPrefixSeparator;
					branchSeparator = separator ?? undefined;

					const rawPrefix = await getBranchPrefix({
						repoPath: project.mainRepoPath,
						mode: prefixMode,
						customPrefix,
					});
					const sanitizedPrefix = rawPrefix
						? sanitizeAuthorPrefix(rawPrefix)
						: undefined;

					const existingSet = new Set(
						existingBranches.map((b) => b.toLowerCase()),
					);
					const prefixWouldCollide =
						sanitizedPrefix && existingSet.has(sanitizedPrefix.toLowerCase());
					branchPrefix = prefixWouldCollide ? undefined : sanitizedPrefix;
				}

				const withPrefix = (name: string): string =>
					applyBranchPrefix(name, branchPrefix, branchSeparator);

				let branch: string;
				if (existingBranchName) {
					if (!existingBranches.includes(existingBranchName)) {
						throw new Error(
							`Branch "${existingBranchName}" does not exist. Please select an existing branch.`,
						);
					}
					branch = existingBranchName;
				} else if (input.branchName?.trim()) {
					branch = withPrefix(sanitizeBranchName(input.branchName));
				} else {
					branch = generateBranchName({
						existingBranches,
						authorPrefix: branchPrefix,
						separator: branchSeparator,
					});
				}

				if (input.branchName?.trim()) {
					const existing = findWorktreeWorkspaceByBranch({
						projectId: input.projectId,
						branch,
					});
					if (existing) {
						touchWorkspace(existing.workspace.id);
						setLastActiveWorkspace(existing.workspace.id);
						activateProject(project);
						return {
							workspace: existing.workspace,
							initialCommands: null,
							worktreePath: existing.worktree.path,
							projectId: project.id,
							isInitializing: false,
							wasExisting: true,
						};
					}

					const orphanedWorktree = findOrphanedWorktreeByBranch({
						projectId: input.projectId,
						branch,
					});
					if (orphanedWorktree) {
						const workspace = createWorkspaceFromWorktree({
							projectId: input.projectId,
							worktreeId: orphanedWorktree.id,
							branch,
							name: input.name ?? branch,
						});
						activateProject(project);
						const setupConfig = loadSetupConfig({
							mainRepoPath: project.mainRepoPath,
							worktreePath: orphanedWorktree.path,
							projectId: project.id,
						});
						return {
							workspace,
							initialCommands: setupConfig?.setup || null,
							worktreePath: orphanedWorktree.path,
							projectId: project.id,
							isInitializing: false,
							wasExisting: true,
						};
					}
				}

				const worktreePath = resolveWorktreePath(project, branch);

				const targetBranch = resolveWorkspaceBaseBranch({
					explicitBaseBranch: input.baseBranch,
					workspaceBaseBranch: project.workspaceBaseBranch,
					defaultBranch: project.defaultBranch,
					knownBranches: existingBranches,
				});

				const worktree = localDb
					.insert(worktrees)
					.values({
						projectId: input.projectId,
						path: worktreePath,
						branch,
						baseBranch: targetBranch,
						gitStatus: null,
					})
					.returning()
					.get();

				const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);

				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch,
						name: input.name ?? branch,
						isUnnamed: !input.name,
						tabOrder: maxTabOrder + 1,
					})
					.returning()
					.get();

				setLastActiveWorkspace(workspace.id);
				activateProject(project);

				track("workspace_created", {
					workspace_id: workspace.id,
					project_id: project.id,
					branch: branch,
					base_branch: targetBranch,
					use_existing_branch: input.useExistingBranch ?? false,
				});

				await setBranchBaseConfig({
					repoPath: project.mainRepoPath,
					branch,
					baseBranch: targetBranch,
					isExplicit: Boolean(input.baseBranch?.trim()),
				});

				workspaceInitManager.startJob(workspace.id, input.projectId);
				initializeWorkspaceWorktree({
					workspaceId: workspace.id,
					projectId: input.projectId,
					worktreeId: worktree.id,
					worktreePath,
					branch,
					mainRepoPath: project.mainRepoPath,
					useExistingBranch: input.useExistingBranch,
				});

				const setupConfig = loadSetupConfig({
					mainRepoPath: project.mainRepoPath,
					worktreePath,
					projectId: project.id,
				});

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath,
					projectId: project.id,
					isInitializing: true,
					wasExisting: false,
				};
			}),

		createBranchWorkspace: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					branch: z.string().optional(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branch =
					input.branch || (await getCurrentBranch(project.mainRepoPath));
				if (!branch) {
					throw new Error("Could not determine current branch");
				}

				if (input.branch) {
					const existingBranchWorkspace = getBranchWorkspace(input.projectId);
					if (
						existingBranchWorkspace &&
						existingBranchWorkspace.branch !== branch
					) {
						throw new Error(
							`A main workspace already exists on branch "${existingBranchWorkspace.branch}".`,
						);
					}
					await safeCheckoutBranch(project.mainRepoPath, input.branch);
				}

				const existing = getBranchWorkspace(input.projectId);

				if (existing) {
					touchWorkspace(existing.id);
					setLastActiveWorkspace(existing.id);
					return {
						workspace: { ...existing, lastOpenedAt: Date.now() },
						worktreePath: project.mainRepoPath,
						projectId: project.id,
						wasExisting: true,
					};
				}

				const insertResult = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						type: "branch",
						branch,
						name: branch,
						tabOrder: 0,
					})
					.onConflictDoNothing()
					.returning()
					.all();

				const wasExisting = insertResult.length === 0;

				if (!wasExisting) {
					const newWorkspaceId = insertResult[0].id;
					const projectWorkspaces = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.projectId, input.projectId),
								// Exclude the workspace we just inserted
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

				const workspace =
					insertResult[0] ?? getBranchWorkspace(input.projectId);

				if (!workspace) {
					throw new Error("Failed to create or find branch workspace");
				}

				setLastActiveWorkspace(workspace.id);

				if (!wasExisting) {
					activateProject(project);

					track("workspace_opened", {
						workspace_id: workspace.id,
						project_id: project.id,
						type: "branch",
						was_existing: false,
					});
				}

				return {
					workspace,
					worktreePath: project.mainRepoPath,
					projectId: project.id,
					wasExisting,
				};
			}),

		openWorktree: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const worktree = getWorktree(input.worktreeId);
				if (!worktree) {
					throw new Error(`Worktree ${input.worktreeId} not found`);
				}

				const existingWorkspace = localDb
					.select()
					.from(workspaces)
					.where(
						and(
							eq(workspaces.worktreeId, input.worktreeId),
							isNull(workspaces.deletingAt),
						),
					)
					.get();
				if (existingWorkspace) {
					throw new Error("Worktree already has an active workspace");
				}

				const project = getProject(worktree.projectId);
				if (!project) {
					throw new Error(`Project ${worktree.projectId} not found`);
				}

				const exists = await worktreeExists(
					project.mainRepoPath,
					worktree.path,
				);
				if (!exists) {
					throw new Error("Worktree no longer exists on disk");
				}

				const maxTabOrder = getMaxWorkspaceTabOrder(worktree.projectId);

				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: worktree.projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch: worktree.branch,
						name: input.name ?? worktree.branch,
						isUnnamed: !input.name,
						tabOrder: maxTabOrder + 1,
					})
					.returning()
					.get();

				setLastActiveWorkspace(workspace.id);
				activateProject(project);

				const setupConfig = loadSetupConfig({
					mainRepoPath: project.mainRepoPath,
					worktreePath: worktree.path,
					projectId: project.id,
				});

				track("workspace_opened", {
					workspace_id: workspace.id,
					project_id: project.id,
					type: "worktree",
				});

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath: worktree.path,
					projectId: project.id,
				};
			}),

		openExternalWorktree: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					worktreePath: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = getProject(input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const exists = await worktreeExists(
					project.mainRepoPath,
					input.worktreePath,
				);
				if (!exists) {
					throw new Error("Worktree no longer exists on disk");
				}

				const existingWorktree = localDb
					.select()
					.from(worktrees)
					.where(
						and(
							eq(worktrees.projectId, input.projectId),
							eq(worktrees.path, input.worktreePath),
						),
					)
					.get();

				if (existingWorktree) {
					// Failed init can leave gitStatus null, which shows "Setup incomplete" UI
					if (!existingWorktree.gitStatus) {
						localDb
							.update(worktrees)
							.set({
								gitStatus: {
									branch: existingWorktree.branch,
									needsRebase: false,
									ahead: 0,
									behind: 0,
									lastRefreshed: Date.now(),
								},
							})
							.where(eq(worktrees.id, existingWorktree.id))
							.run();
					}

					const existingWorkspace = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.worktreeId, existingWorktree.id),
								isNull(workspaces.deletingAt),
							),
						)
						.get();

					if (existingWorkspace) {
						touchWorkspace(existingWorkspace.id);
						setLastActiveWorkspace(existingWorkspace.id);
						return {
							workspace: existingWorkspace,
							initialCommands: null,
							worktreePath: existingWorktree.path,
							projectId: project.id,
							wasExisting: true,
						};
					}

					const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);
					const workspace = localDb
						.insert(workspaces)
						.values({
							projectId: input.projectId,
							worktreeId: existingWorktree.id,
							type: "worktree",
							branch: existingWorktree.branch,
							name: existingWorktree.branch,
							tabOrder: maxTabOrder + 1,
						})
						.returning()
						.get();

					setLastActiveWorkspace(workspace.id);
					activateProject(project);

					copySupersetConfigToWorktree(
						project.mainRepoPath,
						existingWorktree.path,
					);
					const setupConfig = loadSetupConfig({
						mainRepoPath: project.mainRepoPath,
						worktreePath: existingWorktree.path,
						projectId: project.id,
					});

					track("workspace_opened", {
						workspace_id: workspace.id,
						project_id: project.id,
						type: "worktree",
						source: "external_import",
					});

					return {
						workspace,
						initialCommands: setupConfig?.setup || null,
						worktreePath: existingWorktree.path,
						projectId: project.id,
						wasExisting: false,
					};
				}

				const knownBranches = await getKnownBranchesSafe(project.mainRepoPath);
				const baseBranch = resolveWorkspaceBaseBranch({
					workspaceBaseBranch: project.workspaceBaseBranch,
					defaultBranch: project.defaultBranch,
					knownBranches,
				});

				const worktree = localDb
					.insert(worktrees)
					.values({
						projectId: input.projectId,
						path: input.worktreePath,
						branch: input.branch,
						baseBranch,
						gitStatus: {
							branch: input.branch,
							needsRebase: false,
							ahead: 0,
							behind: 0,
							lastRefreshed: Date.now(),
						},
					})
					.returning()
					.get();

				const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);
				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch: input.branch,
						name: input.branch,
						tabOrder: maxTabOrder + 1,
					})
					.returning()
					.get();

				setLastActiveWorkspace(workspace.id);
				activateProject(project);

				copySupersetConfigToWorktree(project.mainRepoPath, input.worktreePath);
				const setupConfig = loadSetupConfig({
					mainRepoPath: project.mainRepoPath,
					worktreePath: input.worktreePath,
					projectId: project.id,
				});

				track("workspace_created", {
					workspace_id: workspace.id,
					project_id: project.id,
					branch: input.branch,
					base_branch: baseBranch,
					source: "external_import",
				});

				await setBranchBaseConfig({
					repoPath: project.mainRepoPath,
					branch: input.branch,
					baseBranch,
					isExplicit: false,
				});

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath: input.worktreePath,
					projectId: project.id,
					wasExisting: false,
				};
			}),

		createFromPr: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					prUrl: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = getProject(input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const parsed = parsePrUrl(input.prUrl);
				if (!parsed) {
					throw new Error(
						"Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123",
					);
				}

				const prInfo = await getPrInfo({
					owner: parsed.owner,
					repo: parsed.repo,
					prNumber: parsed.number,
				});

				const localBranchName = getPrLocalBranchName(prInfo);
				const workspaceName = getPrWorkspaceName(prInfo);

				const existingWorktree = localDb
					.select()
					.from(worktrees)
					.where(
						and(
							eq(worktrees.projectId, input.projectId),
							eq(worktrees.branch, localBranchName),
						),
					)
					.get();

				if (existingWorktree) {
					return handleExistingWorktree({
						existingWorktree,
						project,
						prInfo,
						localBranchName,
						workspaceName,
					});
				}

				return handleNewWorktree({
					project,
					prInfo,
					localBranchName,
					workspaceName,
				});
			}),

		importAllWorktrees: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.mutation(async ({ input }) => {
				const project = getProject(input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}
				const knownBranches = await getKnownBranchesSafe(project.mainRepoPath);
				const baseBranch = resolveWorkspaceBaseBranch({
					workspaceBaseBranch: project.workspaceBaseBranch,
					defaultBranch: project.defaultBranch,
					knownBranches,
				});

				let imported = 0;

				// 1. Import closed worktrees (tracked in DB but no active workspace)
				const projectWorktrees = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.projectId, input.projectId))
					.all();

				for (const wt of projectWorktrees) {
					const existingWorkspace = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.worktreeId, wt.id),
								isNull(workspaces.deletingAt),
							),
						)
						.get();

					if (existingWorkspace) continue;

					const exists = await worktreeExists(project.mainRepoPath, wt.path);
					if (!exists) continue;

					const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);
					localDb
						.insert(workspaces)
						.values({
							projectId: input.projectId,
							worktreeId: wt.id,
							type: "worktree",
							branch: wt.branch,
							name: wt.branch,
							isUnnamed: true,
							tabOrder: maxTabOrder + 1,
						})
						.run();

					imported++;
				}

				// 2. Import external worktrees (on disk, not tracked in DB)
				const allExternalWorktrees = await listExternalWorktrees(
					project.mainRepoPath,
				);
				const trackedPaths = new Set(projectWorktrees.map((wt) => wt.path));

				const externalWorktrees = allExternalWorktrees.filter((wt) => {
					if (wt.path === project.mainRepoPath) return false;
					if (wt.isBare) return false;
					if (wt.isDetached) return false;
					if (!wt.branch) return false;
					if (trackedPaths.has(wt.path)) return false;
					return true;
				});

				for (const ext of externalWorktrees) {
					// biome-ignore lint/style/noNonNullAssertion: filtered above
					const branch = ext.branch!;

					const worktree = localDb
						.insert(worktrees)
						.values({
							projectId: input.projectId,
							path: ext.path,
							branch,
							baseBranch,
							gitStatus: {
								branch,
								needsRebase: false,
								ahead: 0,
								behind: 0,
								lastRefreshed: Date.now(),
							},
						})
						.returning()
						.get();

					const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);
					localDb
						.insert(workspaces)
						.values({
							projectId: input.projectId,
							worktreeId: worktree.id,
							type: "worktree",
							branch,
							name: branch,
							tabOrder: maxTabOrder + 1,
						})
						.run();

					await setBranchBaseConfig({
						repoPath: project.mainRepoPath,
						branch,
						baseBranch,
						isExplicit: false,
					});

					copySupersetConfigToWorktree(project.mainRepoPath, ext.path);
					imported++;
				}

				if (imported > 0) {
					activateProject(project);
					track("workspaces_bulk_imported", {
						project_id: project.id,
						imported_count: imported,
					});
				}

				return { imported };
			}),
	});
};
