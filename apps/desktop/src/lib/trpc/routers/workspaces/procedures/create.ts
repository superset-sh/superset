import { projects, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull, not } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { attemptWorkspaceAutoRenameFromPrompt } from "../utils/ai-name";
import { resolveWorkspaceBaseBranch } from "../utils/base-branch";
import { setBranchBaseConfig } from "../utils/base-branch-config";
import { resolveBranchPrefix } from "../utils/branch-prefix";
import {
	activateProject,
	findOrphanedWorktreeByBranch,
	findWorktreeWorkspaceByBranch,
	getBranchWorkspace,
	getMaxProjectChildTabOrder,
	getProject,
	getWorkspace,
	getWorktree,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../utils/db-helpers";
import {
	createWorktreeFromPr,
	generateBranchName,
	getBranchWorktreePath,
	getCurrentBranch,
	getPrInfo,
	getPrLocalBranchName,
	listBranches,
	listExternalWorktrees,
	type PullRequestInfo,
	parsePrUrl,
	safeCheckoutBranch,
	sanitizeBranchNameWithMaxLength,
	worktreeExists,
} from "../utils/git";
import { resolveWorktreePath } from "../utils/resolve-worktree-path";
import { copySupersetConfigToWorktree, loadSetupConfig } from "../utils/setup";
import {
	createWorkspaceFromExternalWorktree,
	createWorkspaceFromWorktree,
	openExternalWorktree,
} from "../utils/workspace-creation";
import { initializeWorkspaceWorktree } from "../utils/workspace-init";

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
	const compareBaseBranch = resolveWorkspaceBaseBranch({
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
			baseBranch: compareBaseBranch,
			gitStatus: null,
			createdBySuperset: true,
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
		base_branch: compareBaseBranch,
		source: "pr",
		pr_number: prInfo.number,
		is_fork: prInfo.isCrossRepository,
	});

	await setBranchBaseConfig({
		repoPath: project.mainRepoPath,
		branch: localBranchName,
		compareBaseBranch,
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
				z
					.object({
						projectId: z.string(),
						name: z.string().optional(),
						prompt: z.string().optional(),
						branchName: z.string().optional(),
						compareBaseBranch: z.string().optional(),
						sourceWorkspaceId: z.string().optional(),
						useExistingBranch: z.boolean().optional(),
						applyPrefix: z.boolean().optional().default(true),
					})
					.refine(
						(data) => !(data.compareBaseBranch && data.sourceWorkspaceId),
						{
							message:
								"Cannot specify both compareBaseBranch and sourceWorkspaceId. Use one or the other.",
						},
					)
					.refine(
						(data) => !(data.useExistingBranch && data.sourceWorkspaceId),
						{
							message:
								"Cannot specify both useExistingBranch and sourceWorkspaceId.",
						},
					),
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
				const requestedCompareBaseBranch = input.compareBaseBranch;

				const sourceWorkspace = input.sourceWorkspaceId
					? getWorkspace(input.sourceWorkspaceId)
					: undefined;
				if (input.sourceWorkspaceId && !sourceWorkspace) {
					throw new Error(
						`Source workspace "${input.sourceWorkspaceId}" not found`,
					);
				}
				if (sourceWorkspace && sourceWorkspace.projectId !== input.projectId) {
					throw new Error("Source workspace must belong to the same project");
				}

				const sourceWorktree = sourceWorkspace?.worktreeId
					? getWorktree(sourceWorkspace.worktreeId)
					: undefined;
				if (sourceWorkspace && !sourceWorktree) {
					throw new Error(
						`Source workspace "${sourceWorkspace.id}" is not backed by a worktree`,
					);
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

				// Resolve branch prefix using shared utility
				let branchPrefix: string | undefined;
				if (input.applyPrefix) {
					try {
						branchPrefix = await resolveBranchPrefix(project, existingBranches);
					} catch (error) {
						console.warn(
							"[workspace/create] Failed to resolve branch prefix:",
							error,
						);
						branchPrefix = undefined;
					}
				}

				const withPrefix = (name: string): string =>
					branchPrefix ? `${branchPrefix}/${name}` : name;

				let branch: string;
				if (existingBranchName) {
					if (!existingBranches.includes(existingBranchName)) {
						throw new Error(
							`Branch "${existingBranchName}" does not exist. Please select an existing branch.`,
						);
					}
					branch = existingBranchName;
				} else if (input.branchName?.trim()) {
					branch = sanitizeBranchNameWithMaxLength(
						withPrefix(input.branchName),
						undefined,
						{ preserveFirstSegmentCase: true },
					);
				} else {
					branch = generateBranchName({
						existingBranches,
						authorPrefix: branchPrefix,
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
						let autoRenameWarning: string | undefined;
						try {
							const autoRenameResult =
								await attemptWorkspaceAutoRenameFromPrompt({
									workspaceId: workspace.id,
									prompt: input.prompt,
								});
							autoRenameWarning = autoRenameResult.warning;
						} catch (error) {
							console.warn("[workspaces/create] Auto naming failed", {
								workspaceId: workspace.id,
								error: error instanceof Error ? error.message : String(error),
							});
							autoRenameWarning = "Couldn't auto-name this workspace.";
						}
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
							autoRenameWarning,
							wasExisting: true,
						};
					}

					// Check for external worktree (exists on disk but not tracked in DB)
					const externalWorkspaceResult =
						await createWorkspaceFromExternalWorktree({
							projectId: input.projectId,
							branch,
							name: input.name ?? branch,
						});

					if (externalWorkspaceResult) {
						return externalWorkspaceResult;
					}
				}

				const worktreePath = resolveWorktreePath(project, branch);

				const compareBaseBranch = resolveWorkspaceBaseBranch({
					explicitBaseBranch: requestedCompareBaseBranch,
					workspaceBaseBranch:
						sourceWorktree?.baseBranch ?? project.workspaceBaseBranch,
					defaultBranch: project.defaultBranch,
					knownBranches: existingBranches,
				});

				const worktree = localDb
					.insert(worktrees)
					.values({
						projectId: input.projectId,
						path: worktreePath,
						branch,
						baseBranch: compareBaseBranch,
						gitStatus: null,
						createdBySuperset: true,
					})
					.returning()
					.get();

				const maxTabOrder = getMaxProjectChildTabOrder(input.projectId);

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
					base_branch: compareBaseBranch,
					use_existing_branch: input.useExistingBranch ?? false,
				});

				await setBranchBaseConfig({
					repoPath: project.mainRepoPath,
					branch,
					compareBaseBranch,
					isExplicit: Boolean(requestedCompareBaseBranch?.trim()),
				});

				workspaceInitManager.startJob(workspace.id, input.projectId);
				initializeWorkspaceWorktree({
					workspaceId: workspace.id,
					projectId: input.projectId,
					worktreeId: worktree.id,
					worktreePath,
					branch,
					mainRepoPath: project.mainRepoPath,
					startPointBranch: sourceWorkspace?.branch,
					namingPrompt: input.prompt,
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

		openMainRepoWorkspace: publicProcedure
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
					await safeCheckoutBranch(project.mainRepoPath, input.branch);
				}

				const existing = getBranchWorkspace(input.projectId);

				if (existing) {
					if (existing.branch !== branch) {
						localDb
							.update(workspaces)
							.set({ branch })
							.where(eq(workspaces.id, existing.id))
							.run();
					}
					touchWorkspace(existing.id);
					setLastActiveWorkspace(existing.id);
					return {
						workspace: { ...existing, branch, lastOpenedAt: Date.now() },
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

				const maxTabOrder = getMaxProjectChildTabOrder(worktree.projectId);

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
				return openExternalWorktree({
					projectId: input.projectId,
					worktreePath: input.worktreePath,
					branch: input.branch,
				});
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
				const compareBaseBranch = resolveWorkspaceBaseBranch({
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

					const maxTabOrder = getMaxProjectChildTabOrder(input.projectId);
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
							baseBranch: compareBaseBranch,
							gitStatus: {
								branch,
								needsRebase: false,
								ahead: 0,
								behind: 0,
								lastRefreshed: Date.now(),
							},
							createdBySuperset: false, // External worktree
						})
						.returning()
						.get();

					const maxTabOrder = getMaxProjectChildTabOrder(input.projectId);
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
						compareBaseBranch,
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
