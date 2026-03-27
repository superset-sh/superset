import { projects, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { resolveWorkspaceBaseBranch } from "lib/trpc/routers/workspaces/utils/base-branch";
import { setBranchBaseConfig } from "lib/trpc/routers/workspaces/utils/base-branch-config";
import { resolveBranchPrefix } from "lib/trpc/routers/workspaces/utils/branch-prefix";
import {
	activateProject,
	findOrphanedWorktreeByBranch,
	findWorktreeWorkspaceByBranch,
	getMaxProjectChildTabOrder,
	setLastActiveWorkspace,
	touchWorkspace,
} from "lib/trpc/routers/workspaces/utils/db-helpers";
import {
	createWorktreeFromPr,
	generateBranchName,
	getBranchWorktreePath,
	getPrInfo,
	getPrLocalBranchName,
	listBranches,
	parsePrUrl,
	sanitizeBranchNameWithMaxLength,
} from "lib/trpc/routers/workspaces/utils/git";
import { resolveWorktreePath } from "lib/trpc/routers/workspaces/utils/resolve-worktree-path";
import {
	createWorkspaceFromExternalWorktree,
	createWorkspaceFromWorktree,
} from "lib/trpc/routers/workspaces/utils/workspace-creation";
import { initializeWorkspaceWorktree } from "lib/trpc/routers/workspaces/utils/workspace-init";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";

interface WorkspaceDeepLinkParams {
	projectId?: string;
	projectName?: string;
	name?: string;
	branchName?: string;
	baseBranch?: string;
	useExistingBranch?: string;
	prUrl?: string;
}

function resolveProject(params: WorkspaceDeepLinkParams) {
	if (params.projectId) {
		return localDb
			.select()
			.from(projects)
			.where(eq(projects.id, params.projectId))
			.get();
	}
	if (params.projectName) {
		return localDb
			.select()
			.from(projects)
			.where(eq(projects.name, params.projectName))
			.get();
	}
	return undefined;
}

export async function handleWorkspaceCreateDeepLink(
	searchParams: URLSearchParams,
): Promise<{ workspaceId: string } | { error: string }> {
	const params: WorkspaceDeepLinkParams = {
		projectId: searchParams.get("projectId") ?? undefined,
		projectName: searchParams.get("projectName") ?? undefined,
		name: searchParams.get("name") ?? undefined,
		branchName: searchParams.get("branchName") ?? undefined,
		baseBranch: searchParams.get("baseBranch") ?? undefined,
		useExistingBranch: searchParams.get("useExistingBranch") ?? undefined,
		prUrl: searchParams.get("prUrl") ?? undefined,
	};

	const project = resolveProject(params);
	if (!project) {
		return {
			error: `Project not found. Specify projectId or projectName. ${params.projectId ? `projectId="${params.projectId}"` : params.projectName ? `projectName="${params.projectName}"` : "neither projectId nor projectName was provided"}`,
		};
	}

	try {
		if (params.prUrl) {
			return await createFromPr(project, params.prUrl);
		}
		return await createWorkspace(project, params);
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

type Project = typeof projects.$inferSelect;

async function createFromPr(
	project: Project,
	prUrl: string,
): Promise<{ workspaceId: string } | { error: string }> {
	const parsed = parsePrUrl(prUrl);
	if (!parsed) {
		return {
			error:
				"Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123",
		};
	}

	const prInfo = await getPrInfo({
		owner: parsed.owner,
		repo: parsed.repo,
		prNumber: parsed.number,
	});

	const localBranchName = getPrLocalBranchName(prInfo);
	const workspaceName = prInfo.title || `PR #${prInfo.number}`;

	// Check for existing worktree
	const existingWorktree = localDb
		.select()
		.from(worktrees)
		.where(
			and(
				eq(worktrees.projectId, project.id),
				eq(worktrees.branch, localBranchName),
			),
		)
		.get();

	if (existingWorktree) {
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
			activateProject(project);
			return { workspaceId: existingWorkspace.id };
		}

		const workspace = createWorkspaceFromWorktree({
			projectId: project.id,
			worktreeId: existingWorktree.id,
			branch: localBranchName,
			name: workspaceName,
		});
		setLastActiveWorkspace(workspace.id);
		activateProject(project);
		return { workspaceId: workspace.id };
	}

	const existingWorktreePath = await getBranchWorktreePath({
		mainRepoPath: project.mainRepoPath,
		branch: localBranchName,
	});
	if (existingWorktreePath) {
		return {
			error: `Branch is already checked out at: ${existingWorktreePath}`,
		};
	}

	const worktreePath = resolveWorktreePath(project, localBranchName);

	await createWorktreeFromPr({
		mainRepoPath: project.mainRepoPath,
		worktreePath,
		prInfo,
		localBranchName,
	});

	const { local, remote } = await listBranches(project.mainRepoPath);
	const baseBranch = resolveWorkspaceBaseBranch({
		workspaceBaseBranch: project.workspaceBaseBranch,
		defaultBranch: project.defaultBranch,
		knownBranches: [...local, ...remote],
	});

	const worktree = localDb
		.insert(worktrees)
		.values({
			projectId: project.id,
			path: worktreePath,
			branch: localBranchName,
			baseBranch,
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

	setLastActiveWorkspace(workspace.id);
	activateProject(project);

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

	return { workspaceId: workspace.id };
}

async function createWorkspace(
	project: Project,
	params: WorkspaceDeepLinkParams,
): Promise<{ workspaceId: string } | { error: string }> {
	const useExistingBranch = params.useExistingBranch === "true";

	let existingBranchName: string | undefined;
	if (useExistingBranch) {
		existingBranchName = params.branchName?.trim();
		if (!existingBranchName) {
			return {
				error: "branchName is required when useExistingBranch=true",
			};
		}

		const existingWorktreePath = await getBranchWorktreePath({
			mainRepoPath: project.mainRepoPath,
			branch: existingBranchName,
		});
		if (existingWorktreePath) {
			return {
				error: `Branch "${existingBranchName}" is already checked out at: ${existingWorktreePath}`,
			};
		}
	}

	const { local, remote } = await listBranches(project.mainRepoPath);
	const existingBranches = [...local, ...remote];

	let branchPrefix: string | undefined;
	try {
		branchPrefix = await resolveBranchPrefix(project, existingBranches);
	} catch (error) {
		console.warn("[deep-link] Failed to resolve branch prefix:", error);
		branchPrefix = undefined;
	}

	const withPrefix = (name: string): string =>
		branchPrefix ? `${branchPrefix}/${name}` : name;

	let branch: string;
	if (existingBranchName) {
		if (!existingBranches.includes(existingBranchName)) {
			return {
				error: `Branch "${existingBranchName}" does not exist`,
			};
		}
		branch = existingBranchName;
	} else if (params.branchName?.trim()) {
		branch = sanitizeBranchNameWithMaxLength(
			withPrefix(params.branchName),
			undefined,
			{ preserveFirstSegmentCase: true },
		);
	} else {
		branch = generateBranchName({
			existingBranches,
			authorPrefix: branchPrefix,
		});
	}

	// Check for existing workspace with this branch
	if (params.branchName?.trim()) {
		const existing = findWorktreeWorkspaceByBranch({
			projectId: project.id,
			branch,
		});
		if (existing) {
			touchWorkspace(existing.workspace.id);
			setLastActiveWorkspace(existing.workspace.id);
			activateProject(project);
			return { workspaceId: existing.workspace.id };
		}

		const orphanedWorktree = findOrphanedWorktreeByBranch({
			projectId: project.id,
			branch,
		});
		if (orphanedWorktree) {
			const workspace = createWorkspaceFromWorktree({
				projectId: project.id,
				worktreeId: orphanedWorktree.id,
				branch,
				name: params.name ?? branch,
			});
			setLastActiveWorkspace(workspace.id);
			activateProject(project);
			return { workspaceId: workspace.id };
		}

		const externalResult = await createWorkspaceFromExternalWorktree({
			projectId: project.id,
			branch,
			name: params.name ?? branch,
		});
		if (externalResult) {
			setLastActiveWorkspace(externalResult.workspace.id);
			activateProject(project);
			return { workspaceId: externalResult.workspace.id };
		}
	}

	const worktreePath = resolveWorktreePath(project, branch);

	const targetBranch = resolveWorkspaceBaseBranch({
		explicitBaseBranch: params.baseBranch,
		workspaceBaseBranch: project.workspaceBaseBranch,
		defaultBranch: project.defaultBranch,
		knownBranches: existingBranches,
	});

	const worktree = localDb
		.insert(worktrees)
		.values({
			projectId: project.id,
			path: worktreePath,
			branch,
			baseBranch: targetBranch,
			gitStatus: null,
			createdBySuperset: true,
		})
		.returning()
		.get();

	const maxTabOrder = getMaxProjectChildTabOrder(project.id);

	const workspace = localDb
		.insert(workspaces)
		.values({
			projectId: project.id,
			worktreeId: worktree.id,
			type: "worktree",
			branch,
			name: params.name ?? branch,
			isUnnamed: !params.name,
			tabOrder: maxTabOrder + 1,
		})
		.returning()
		.get();

	setLastActiveWorkspace(workspace.id);
	activateProject(project);

	track("workspace_created", {
		workspace_id: workspace.id,
		project_id: project.id,
		branch,
		base_branch: targetBranch,
		use_existing_branch: useExistingBranch,
		source: "deep_link",
	});

	await setBranchBaseConfig({
		repoPath: project.mainRepoPath,
		branch,
		baseBranch: targetBranch,
		isExplicit: Boolean(params.baseBranch?.trim()),
	});

	workspaceInitManager.startJob(workspace.id, project.id);
	initializeWorkspaceWorktree({
		workspaceId: workspace.id,
		projectId: project.id,
		worktreeId: worktree.id,
		worktreePath,
		branch,
		mainRepoPath: project.mainRepoPath,
		useExistingBranch,
	});

	return { workspaceId: workspace.id };
}
