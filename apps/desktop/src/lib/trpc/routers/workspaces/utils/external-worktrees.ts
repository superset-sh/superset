import type { SelectWorktree } from "@superset/local-db/schema";
import {
	findOrphanedWorktreeByBranch,
	findWorktreeWorkspaceByBranch,
} from "./db-helpers";
import { type ExternalWorktree, listExternalWorktrees } from "./git";
import {
	findProjectWorktreeByCurrentPath,
	listProjectWorktreesWithCurrentPaths,
	resolveWorktreePathWithRepair,
} from "./repair-worktree-path";

interface ExternalWorktreeDeps {
	findOrphanedWorktreeByBranch: typeof findOrphanedWorktreeByBranch;
	findProjectWorktreeByCurrentPath: typeof findProjectWorktreeByCurrentPath;
	findWorktreeWorkspaceByBranch: typeof findWorktreeWorkspaceByBranch;
	listExternalWorktrees: typeof listExternalWorktrees;
	listProjectWorktreesWithCurrentPaths: typeof listProjectWorktreesWithCurrentPaths;
	resolveWorktreePathWithRepair: typeof resolveWorktreePathWithRepair;
}

export const __testOnlyExternalWorktreeDeps: ExternalWorktreeDeps = {
	findOrphanedWorktreeByBranch,
	findProjectWorktreeByCurrentPath,
	findWorktreeWorkspaceByBranch,
	listExternalWorktrees,
	listProjectWorktreesWithCurrentPaths,
	resolveWorktreePathWithRepair,
};

export type ExternalWorktreeOpenTarget =
	| {
			kind: "tracked";
			worktree: SelectWorktree;
	  }
	| {
			kind: "external";
			worktreePath: string;
			branch: string;
	  };

type ImportableExternalWorktree = ExternalWorktree & { branch: string };

function isImportableExternalWorktree(
	worktree: ExternalWorktree,
	mainRepoPath: string,
): worktree is ImportableExternalWorktree {
	return (
		worktree.path !== mainRepoPath &&
		!worktree.isBare &&
		!worktree.isDetached &&
		Boolean(worktree.branch)
	);
}

function getImportableExternalWorktrees(
	externalWorktrees: ExternalWorktree[],
	mainRepoPath: string,
): ImportableExternalWorktree[] {
	return externalWorktrees.filter(
		(worktree): worktree is ImportableExternalWorktree =>
			isImportableExternalWorktree(worktree, mainRepoPath),
	);
}

async function resolveTrackedExternalWorktree(
	worktree: SelectWorktree,
): Promise<SelectWorktree> {
	const resolvedPath =
		await __testOnlyExternalWorktreeDeps.resolveWorktreePathWithRepair(
			worktree.id,
		);

	if (!resolvedPath || resolvedPath === worktree.path) {
		return worktree;
	}

	return {
		...worktree,
		path: resolvedPath,
	};
}

export async function resolveExternalWorktreeOpenTarget(input: {
	projectId: string;
	mainRepoPath: string;
	worktreePath: string;
	branch: string;
}): Promise<ExternalWorktreeOpenTarget | null> {
	const trackedWorktree =
		(await __testOnlyExternalWorktreeDeps.findProjectWorktreeByCurrentPath(
			input.projectId,
			input.worktreePath,
		)) ??
		__testOnlyExternalWorktreeDeps.findWorktreeWorkspaceByBranch({
			projectId: input.projectId,
			branch: input.branch,
		})?.worktree ??
		__testOnlyExternalWorktreeDeps.findOrphanedWorktreeByBranch({
			projectId: input.projectId,
			branch: input.branch,
		});

	if (trackedWorktree) {
		return {
			kind: "tracked",
			worktree: await resolveTrackedExternalWorktree(trackedWorktree),
		};
	}

	const externalWorktrees =
		await __testOnlyExternalWorktreeDeps.listExternalWorktrees(
			input.mainRepoPath,
		);
	const matchingExternalWorktree = getImportableExternalWorktrees(
		externalWorktrees,
		input.mainRepoPath,
	).find(
		(worktree) =>
			worktree.path === input.worktreePath || worktree.branch === input.branch,
	);

	if (!matchingExternalWorktree) {
		return null;
	}

	return {
		kind: "external",
		worktreePath: matchingExternalWorktree.path,
		branch: matchingExternalWorktree.branch,
	};
}

export async function listImportableExternalWorktrees(input: {
	projectId: string;
	mainRepoPath: string;
}): Promise<
	Array<{
		path: string;
		branch: string;
	}>
> {
	const trackedWorktrees =
		await __testOnlyExternalWorktreeDeps.listProjectWorktreesWithCurrentPaths(
			input.projectId,
		);
	const trackedPaths = new Set(
		trackedWorktrees.map((trackedWorktree) => trackedWorktree.worktree.path),
	);
	const trackedBranches = new Set(
		trackedWorktrees.map((trackedWorktree) => trackedWorktree.worktree.branch),
	);

	const externalWorktrees =
		await __testOnlyExternalWorktreeDeps.listExternalWorktrees(
			input.mainRepoPath,
		);

	return getImportableExternalWorktrees(externalWorktrees, input.mainRepoPath)
		.filter(
			(worktree) =>
				!trackedPaths.has(worktree.path) &&
				!trackedBranches.has(worktree.branch),
		)
		.map((worktree) => ({
			path: worktree.path,
			branch: worktree.branch,
		}));
}
