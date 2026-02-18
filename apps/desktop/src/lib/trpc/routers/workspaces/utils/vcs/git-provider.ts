/**
 * GitProvider — implements VcsProvider by delegating to existing git.ts functions.
 * This is a thin wrapper that preserves all existing git behavior exactly.
 */

import simpleGit from "simple-git";
import {
	createWorktree,
	createWorktreeFromExistingBranch,
	getBranchWorktreePath,
	getGitRoot,
	branchExistsOnRemote as gitBranchExistsOnRemote,
	checkoutBranch as gitCheckoutBranch,
	deleteLocalBranch as gitDeleteLocalBranch,
	fetchDefaultBranch as gitFetchDefaultBranch,
	getAheadBehindCount as gitGetAheadBehindCount,
	getCurrentBranch as gitGetCurrentBranch,
	getDefaultBranch as gitGetDefaultBranch,
	hasOriginRemote as gitHasOriginRemote,
	hasUncommittedChanges as gitHasUncommittedChanges,
	hasUnpushedCommits as gitHasUnpushedCommits,
	listBranches as gitListBranches,
	refExistsLocally as gitRefExistsLocally,
	refreshDefaultBranch as gitRefreshDefaultBranch,
	safeCheckoutBranch as gitSafeCheckoutBranch,
	worktreeExists as gitWorktreeExists,
	listExternalWorktrees,
	removeWorktree,
} from "../git";
import type {
	BranchExistsOnRemoteResult,
	ExternalWorkspace,
	VcsProvider,
} from "./types";

export class GitProvider implements VcsProvider {
	readonly type = "git" as const;

	async createWorkspace(params: {
		mainRepoPath: string;
		branch: string;
		workspacePath: string;
		startPoint?: string;
	}): Promise<void> {
		return createWorktree(
			params.mainRepoPath,
			params.branch,
			params.workspacePath,
			params.startPoint,
		);
	}

	async createWorkspaceFromExistingBranch(params: {
		mainRepoPath: string;
		branch: string;
		workspacePath: string;
	}): Promise<void> {
		return createWorktreeFromExistingBranch({
			mainRepoPath: params.mainRepoPath,
			branch: params.branch,
			worktreePath: params.workspacePath,
		});
	}

	async removeWorkspace(
		mainRepoPath: string,
		workspacePath: string,
	): Promise<void> {
		return removeWorktree(mainRepoPath, workspacePath);
	}

	async workspaceExists(
		mainRepoPath: string,
		workspacePath: string,
	): Promise<boolean> {
		return gitWorktreeExists(mainRepoPath, workspacePath);
	}

	async listExternalWorkspaces(
		mainRepoPath: string,
	): Promise<ExternalWorkspace[]> {
		return listExternalWorktrees(mainRepoPath);
	}

	async getBranchWorkspacePath(params: {
		mainRepoPath: string;
		branch: string;
	}): Promise<string | null> {
		return getBranchWorktreePath(params);
	}

	async hasUncommittedChanges(workspacePath: string): Promise<boolean> {
		return gitHasUncommittedChanges(workspacePath);
	}

	async hasUnpushedCommits(workspacePath: string): Promise<boolean> {
		return gitHasUnpushedCommits(workspacePath);
	}

	async getAheadBehindCount(params: {
		repoPath: string;
		defaultBranch: string;
	}): Promise<{ ahead: number; behind: number }> {
		return gitGetAheadBehindCount(params);
	}

	async getCurrentBranch(repoPath: string): Promise<string | null> {
		return gitGetCurrentBranch(repoPath);
	}

	async listBranches(
		repoPath: string,
		options?: { fetch?: boolean },
	): Promise<{ local: string[]; remote: string[] }> {
		return gitListBranches(repoPath, options);
	}

	async getDefaultBranch(mainRepoPath: string): Promise<string> {
		return gitGetDefaultBranch(mainRepoPath);
	}

	async refreshDefaultBranch(mainRepoPath: string): Promise<string | null> {
		return gitRefreshDefaultBranch(mainRepoPath);
	}

	async fetchDefaultBranch(
		mainRepoPath: string,
		defaultBranch: string,
	): Promise<string> {
		return gitFetchDefaultBranch(mainRepoPath, defaultBranch);
	}

	async deleteLocalBranch(params: {
		mainRepoPath: string;
		branch: string;
	}): Promise<void> {
		return gitDeleteLocalBranch(params);
	}

	async checkoutBranch(repoPath: string, branch: string): Promise<void> {
		return gitCheckoutBranch(repoPath, branch);
	}

	async safeCheckoutBranch(repoPath: string, branch: string): Promise<void> {
		return gitSafeCheckoutBranch(repoPath, branch);
	}

	async refExistsLocally(repoPath: string, ref: string): Promise<boolean> {
		return gitRefExistsLocally(repoPath, ref);
	}

	async hasOriginRemote(mainRepoPath: string): Promise<boolean> {
		return gitHasOriginRemote(mainRepoPath);
	}

	async branchExistsOnRemote(
		repoPath: string,
		branch: string,
	): Promise<BranchExistsOnRemoteResult> {
		return gitBranchExistsOnRemote(repoPath, branch);
	}

	async getRepoRoot(path: string): Promise<string> {
		return getGitRoot(path);
	}

	async getBaseBranchConfig(
		repoPath: string,
		branch: string,
	): Promise<string | null> {
		try {
			const result = await simpleGit(repoPath).raw([
				"config",
				`branch.${branch}.base`,
			]);
			return result.trim() || null;
		} catch {
			return null;
		}
	}

	async setBaseBranchConfig(
		repoPath: string,
		branch: string,
		baseBranch: string,
	): Promise<void> {
		await simpleGit(repoPath)
			.raw(["config", `branch.${branch}.base`, baseBranch])
			.catch(() => {});
	}
}
