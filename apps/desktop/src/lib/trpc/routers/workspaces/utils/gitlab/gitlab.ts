import type { GitHubStatus, PullRequestComment } from "@superset/local-db";
import { branchExistsOnRemote } from "../git";
import { execGitWithShellPath } from "../git-client";
import { parseUpstreamRef } from "../upstream-ref";
import {
	clearGitLabCachesForWorktree,
	getCachedMRCommentsState,
	makeMRCommentsCacheKey,
	readCachedGitLabStatus,
	readCachedMRComments,
} from "./cache";
import { fetchMergeRequestComments } from "./comments";
import { getMRForBranch } from "./mr-resolution";
import { getGitLabRepoContext } from "./repo-context";
import type { GitLabRepoContext } from "./types";

export interface MRCommentsTarget {
	mrIid: number;
	repoContext: Pick<
		GitLabRepoContext,
		"repoUrl" | "upstreamUrl" | "isFork" | "projectPath"
	>;
	mrWebUrl?: string;
}

export { clearGitLabCachesForWorktree };

function getMRCommentsProjectPath(target: MRCommentsTarget): string | null {
	return target.repoContext.projectPath || null;
}

async function resolveMRCommentsTarget(
	worktreePath: string,
): Promise<MRCommentsTarget | null> {
	const repoContext = await getGitLabRepoContext(worktreePath, {
		forceFresh: true,
	});
	if (!repoContext) {
		return null;
	}

	const [branchResult, shaResult] = await Promise.all([
		execGitWithShellPath(["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: worktreePath,
		}),
		execGitWithShellPath(["rev-parse", "HEAD"], {
			cwd: worktreePath,
		}),
	]);
	const branchName = branchResult.stdout.trim();
	const headSha = shaResult.stdout.trim();

	const mrInfo = await getMRForBranch(
		worktreePath,
		branchName,
		repoContext,
		headSha,
	);
	if (!mrInfo) {
		return null;
	}

	return {
		mrIid: mrInfo.number,
		repoContext,
		mrWebUrl: mrInfo.url,
	};
}

async function refreshGitLabMRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	try {
		const repoContext = await getGitLabRepoContext(worktreePath, {
			forceFresh: true,
		});
		if (!repoContext) {
			return null;
		}

		const [branchResult, shaResult, upstreamResult] = await Promise.all([
			execGitWithShellPath(["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: worktreePath,
			}),
			execGitWithShellPath(["rev-parse", "HEAD"], { cwd: worktreePath }),
			execGitWithShellPath(["rev-parse", "--abbrev-ref", "@{upstream}"], {
				cwd: worktreePath,
			}).catch(() => ({ stdout: "", stderr: "" })),
		]);

		const branchName = branchResult.stdout.trim();
		const headSha = shaResult.stdout.trim();
		const parsedUpstreamRef = parseUpstreamRef(upstreamResult.stdout.trim());
		const trackingRemote = parsedUpstreamRef?.remoteName ?? "origin";
		const remoteBranchName =
			parsedUpstreamRef?.branchName?.trim() || branchName;

		const mrInfo = await getMRForBranch(
			worktreePath,
			branchName,
			repoContext,
			headSha,
		);

		const branchCheck = await branchExistsOnRemote(
			worktreePath,
			remoteBranchName,
			trackingRemote,
		);

		const result: GitHubStatus = {
			pr: mrInfo,
			repoUrl: repoContext.repoUrl,
			upstreamUrl: repoContext.upstreamUrl,
			isFork: repoContext.isFork,
			branchExistsOnRemote: branchCheck.status === "exists",
			previewUrl: undefined,
			lastRefreshed: Date.now(),
		};

		return result;
	} catch {
		return null;
	}
}

async function refreshGitLabMRComments({
	worktreePath,
	projectPath,
	mrIid,
	mrWebUrl,
}: {
	worktreePath: string;
	projectPath: string;
	mrIid: number;
	mrWebUrl?: string;
}): Promise<PullRequestComment[]> {
	return fetchMergeRequestComments({
		worktreePath,
		projectPath,
		mrIid,
		mrWebUrl,
	});
}

/**
 * Fetches GitLab MR status for a worktree using the `glab` CLI.
 * Returns null if `glab` is not installed, not authenticated, or on error.
 */
export async function fetchGitLabMRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	return readCachedGitLabStatus(worktreePath, () =>
		refreshGitLabMRStatus(worktreePath),
	);
}

export async function fetchGitLabMRComments({
	worktreePath,
	mergeRequest,
}: {
	worktreePath: string;
	mergeRequest?: MRCommentsTarget | null;
}): Promise<PullRequestComment[]> {
	try {
		const mrTarget =
			mergeRequest ?? (await resolveMRCommentsTarget(worktreePath));
		if (!mrTarget) {
			return [];
		}

		const projectPath = getMRCommentsProjectPath(mrTarget);
		if (!projectPath) {
			return [];
		}

		const cacheKey = makeMRCommentsCacheKey({
			worktreePath,
			projectPath,
			mrIid: mrTarget.mrIid,
		});

		try {
			return await readCachedMRComments(cacheKey, () =>
				refreshGitLabMRComments({
					worktreePath,
					projectPath,
					mrIid: mrTarget.mrIid,
					mrWebUrl: mrTarget.mrWebUrl,
				}),
			);
		} catch (error) {
			const cached = getCachedMRCommentsState(cacheKey);
			if (cached) {
				console.warn(
					"[GitLab] Failed to refresh MR comments; using cached value:",
					error,
				);
				return cached.value;
			}

			throw error;
		}
	} catch {
		return [];
	}
}
