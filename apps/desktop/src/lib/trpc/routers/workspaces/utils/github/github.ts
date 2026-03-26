import type { GitHubStatus, PullRequestComment } from "@superset/local-db";
import {
	branchExistsOnRemote,
	getCurrentBranch,
	isUnbornHeadError,
} from "../git";
import { execGitWithShellPath } from "../git-client";
import { execWithShellEnv } from "../shell-env";
import { parseUpstreamRef } from "../upstream-ref";
import {
	clearGitHubCachesForWorktree,
	getCachedPullRequestCommentsState,
	makePullRequestCommentsCacheKey,
	readCachedGitHubStatus,
	readCachedPullRequestComments,
} from "./cache";
import { fetchPullRequestComments } from "./comments";
import { getPRForBranch } from "./pr-resolution";
import { extractNwoFromUrl, getRepoContext } from "./repo-context";
import {
	GHDeploymentSchema,
	GHDeploymentStatusSchema,
	type RepoContext,
} from "./types";

export interface PullRequestCommentsTarget {
	prNumber: number;
	repoContext: Pick<RepoContext, "repoUrl" | "upstreamUrl" | "isFork">;
}

export { clearGitHubCachesForWorktree };

function getPullRequestCommentsRepoNameWithOwner(
	target: PullRequestCommentsTarget,
): string | null {
	const targetUrl = target.repoContext.isFork
		? target.repoContext.upstreamUrl
		: target.repoContext.repoUrl;

	return extractNwoFromUrl(targetUrl);
}

async function resolvePullRequestCommentsTarget(
	worktreePath: string,
): Promise<PullRequestCommentsTarget | null> {
	const repoContext = await getRepoContext(worktreePath);
	if (!repoContext) {
		return null;
	}

	const branchName = await getCurrentBranch(worktreePath);
	if (!branchName) {
		return null;
	}
	const shaResult = await execGitWithShellPath(["rev-parse", "HEAD"], {
		cwd: worktreePath,
	}).catch((error) => {
		if (isUnbornHeadError(error)) {
			return { stdout: "", stderr: "" };
		}
		throw error;
	});
	const headSha = shaResult.stdout.trim() || undefined;
	const prInfo = await getPRForBranch(
		worktreePath,
		branchName,
		repoContext,
		headSha,
	);
	if (!prInfo) {
		return null;
	}

	return {
		prNumber: prInfo.number,
		repoContext,
	};
}

export function resolveRemoteBranchNameForGitHubStatus({
	localBranchName,
	upstreamBranchName,
	prHeadRefName,
}: {
	localBranchName: string;
	upstreamBranchName?: string | null;
	prHeadRefName?: string | null;
}): string {
	return upstreamBranchName?.trim() || prHeadRefName?.trim() || localBranchName;
}

async function refreshGitHubPRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	try {
		const repoContext = await getRepoContext(worktreePath);
		if (!repoContext) {
			return null;
		}

		const branchName = await getCurrentBranch(worktreePath);
		if (!branchName) {
			return null;
		}

		const [shaResult, upstreamResult] = await Promise.all([
			execGitWithShellPath(["rev-parse", "HEAD"], {
				cwd: worktreePath,
			}).catch((error) => {
				if (isUnbornHeadError(error)) {
					return { stdout: "", stderr: "" };
				}
				throw error;
			}),
			execGitWithShellPath(["rev-parse", "--abbrev-ref", "@{upstream}"], {
				cwd: worktreePath,
			}).catch(() => ({ stdout: "", stderr: "" })),
		]);
		const headSha = shaResult.stdout.trim() || undefined;
		const parsedUpstreamRef = parseUpstreamRef(upstreamResult.stdout.trim());
		const trackingRemote = parsedUpstreamRef?.remoteName ?? "origin";
		const previewBranchName = resolveRemoteBranchNameForGitHubStatus({
			localBranchName: branchName,
			upstreamBranchName: parsedUpstreamRef?.branchName,
		});

		const [prInfo, previewUrl] = await Promise.all([
			getPRForBranch(worktreePath, branchName, repoContext, headSha),
			fetchPreviewDeploymentUrl(
				worktreePath,
				headSha,
				previewBranchName,
				repoContext,
			),
		]);

		const remoteBranchName = resolveRemoteBranchNameForGitHubStatus({
			localBranchName: branchName,
			upstreamBranchName: parsedUpstreamRef?.branchName,
			prHeadRefName: prInfo?.headRefName,
		});

		const branchCheck = await branchExistsOnRemote(
			worktreePath,
			remoteBranchName,
			trackingRemote,
		);

		let finalPreviewUrl = previewUrl;
		if (!finalPreviewUrl && prInfo?.number) {
			const targetUrl = repoContext.isFork
				? repoContext.upstreamUrl
				: repoContext.repoUrl;
			const nwo = extractNwoFromUrl(targetUrl);
			if (nwo) {
				finalPreviewUrl = await queryDeploymentUrl(
					worktreePath,
					nwo,
					`ref=${encodeURIComponent(`refs/pull/${prInfo.number}/merge`)}`,
				);
			}
		}

		const result: GitHubStatus = {
			pr: prInfo,
			repoUrl: repoContext.repoUrl,
			upstreamUrl: repoContext.upstreamUrl,
			isFork: repoContext.isFork,
			branchExistsOnRemote: branchCheck.status === "exists",
			previewUrl: finalPreviewUrl,
			lastRefreshed: Date.now(),
		};

		return result;
	} catch {
		return null;
	}
}

async function refreshGitHubPRComments({
	worktreePath,
	repoNameWithOwner,
	pullRequestNumber,
}: {
	worktreePath: string;
	repoNameWithOwner: string;
	pullRequestNumber: number;
}): Promise<PullRequestComment[]> {
	return fetchPullRequestComments({
		worktreePath,
		repoNameWithOwner,
		pullRequestNumber,
	});
}

/**
 * Fetches GitHub PR status for a worktree using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 */
export async function fetchGitHubPRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	return readCachedGitHubStatus(worktreePath, () =>
		refreshGitHubPRStatus(worktreePath),
	);
}

export async function fetchGitHubPRComments({
	worktreePath,
	pullRequest,
}: {
	worktreePath: string;
	pullRequest?: PullRequestCommentsTarget | null;
}): Promise<PullRequestComment[]> {
	try {
		const pullRequestTarget =
			pullRequest ?? (await resolvePullRequestCommentsTarget(worktreePath));
		if (!pullRequestTarget) {
			return [];
		}

		const repoNameWithOwner =
			getPullRequestCommentsRepoNameWithOwner(pullRequestTarget);
		if (!repoNameWithOwner) {
			return [];
		}

		const cacheKey = makePullRequestCommentsCacheKey({
			worktreePath,
			repoNameWithOwner,
			pullRequestNumber: pullRequestTarget.prNumber,
		});
		try {
			return await readCachedPullRequestComments(cacheKey, () =>
				refreshGitHubPRComments({
					worktreePath,
					repoNameWithOwner,
					pullRequestNumber: pullRequestTarget.prNumber,
				}),
			);
		} catch (error) {
			const cached = getCachedPullRequestCommentsState(cacheKey);
			if (cached) {
				console.warn(
					"[GitHub] Failed to refresh pull request comments; using cached value:",
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

function isSafeHttpUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Low-level helper: query deployments matching the given params and return
 * the environment_url of the first successful deployment. Status lookups
 * are parallelized to minimize latency.
 */
async function queryDeploymentUrl(
	worktreePath: string,
	nwo: string,
	queryParams: string,
): Promise<string | undefined> {
	const { stdout } = await execWithShellEnv(
		"gh",
		["api", `repos/${nwo}/deployments?${queryParams}&per_page=5`],
		{ cwd: worktreePath },
	);

	const rawDeployments: unknown = JSON.parse(stdout.trim());
	if (!Array.isArray(rawDeployments) || rawDeployments.length === 0) {
		return undefined;
	}

	const deploymentIds: number[] = [];
	for (const raw of rawDeployments) {
		const result = GHDeploymentSchema.safeParse(raw);
		if (result.success) {
			deploymentIds.push(result.data.id);
		}
	}
	if (deploymentIds.length === 0) {
		return undefined;
	}

	const urls = await Promise.all(
		deploymentIds.map(async (id): Promise<string | undefined> => {
			try {
				const { stdout: out } = await execWithShellEnv(
					"gh",
					["api", `repos/${nwo}/deployments/${id}/statuses?per_page=1`],
					{ cwd: worktreePath },
				);
				const rawStatuses: unknown = JSON.parse(out.trim());
				if (!Array.isArray(rawStatuses) || rawStatuses.length === 0) {
					return undefined;
				}
				const statusResult = GHDeploymentStatusSchema.safeParse(rawStatuses[0]);
				if (!statusResult.success) {
					return undefined;
				}
				if (
					statusResult.data.state === "success" &&
					statusResult.data.environment_url &&
					isSafeHttpUrl(statusResult.data.environment_url)
				) {
					return statusResult.data.environment_url;
				}
				return undefined;
			} catch {
				return undefined;
			}
		}),
	);

	// Return the first successful URL (preserves deployment order: most recent first)
	return urls.find((url): url is string => url !== undefined);
}

/**
 * Fetches the preview deployment URL by trying multiple query strategies:
 * 1. By commit SHA (works for Vercel, Netlify official integrations)
 * 2. By branch name ref (works for some CI configurations)
 * The PR merge ref (refs/pull/N/merge) is handled in fetchGitHubPRStatus
 * after the PR number is known.
 */
async function fetchPreviewDeploymentUrl(
	worktreePath: string,
	headSha: string | undefined,
	branchName: string,
	repoContext: RepoContext,
): Promise<string | undefined> {
	try {
		const targetUrl = repoContext.isFork
			? repoContext.upstreamUrl
			: repoContext.repoUrl;
		const nwo = extractNwoFromUrl(targetUrl);
		if (!nwo) {
			return undefined;
		}

		if (headSha) {
			// Try by commit SHA (works for Vercel, Netlify official integrations)
			const bySha = await queryDeploymentUrl(
				worktreePath,
				nwo,
				`sha=${headSha}`,
			);
			if (bySha) {
				return bySha;
			}
		}

		// Fall back to branch name (works for some CI configurations)
		return await queryDeploymentUrl(
			worktreePath,
			nwo,
			`ref=${encodeURIComponent(branchName)}`,
		);
	} catch {
		return undefined;
	}
}
