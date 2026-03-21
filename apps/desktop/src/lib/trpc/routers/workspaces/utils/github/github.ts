import type { GitHubStatus } from "@superset/local-db";
import { branchExistsOnRemote } from "../git";
import { execGitWithShellPath } from "../git-client";
import { execWithShellEnv } from "../shell-env";
import { parseUpstreamRef } from "../upstream-ref";
import { getPRForBranch } from "./pr-resolution";
import { extractNwoFromUrl, getRepoContext } from "./repo-context";
import {
	GHDeploymentSchema,
	GHDeploymentStatusSchema,
	type RepoContext,
} from "./types";

const cache = new Map<string, { data: GitHubStatus; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

export function clearGitHubStatusCacheForWorktree(worktreePath: string): void {
	cache.delete(worktreePath);
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

/**
 * Fetches GitHub PR status for a worktree using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 */
export async function fetchGitHubPRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	const cached = cache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		const repoContext = await getRepoContext(worktreePath);
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

		const [prInfo, previewUrl] = await Promise.all([
			getPRForBranch(worktreePath, branchName, repoContext, headSha),
			fetchPreviewDeploymentUrl(
				worktreePath,
				headSha,
				resolveRemoteBranchNameForGitHubStatus({
					localBranchName: branchName,
					upstreamBranchName: parsedUpstreamRef?.branchName,
				}),
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

		// If no preview URL found via SHA/branch, try the PR merge ref
		// (GitHub Actions pull_request triggers use refs/pull/N/merge)
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

		cache.set(worktreePath, { data: result, timestamp: Date.now() });

		return result;
	} catch {
		return null;
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
		if (result.success) deploymentIds.push(result.data.id);
	}
	if (deploymentIds.length === 0) return undefined;

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
				if (!statusResult.success) return undefined;
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
	headSha: string,
	branchName: string,
	repoContext: RepoContext,
): Promise<string | undefined> {
	try {
		const targetUrl = repoContext.isFork
			? repoContext.upstreamUrl
			: repoContext.repoUrl;
		const nwo = extractNwoFromUrl(targetUrl);
		if (!nwo) return undefined;

		// Try by commit SHA (works for Vercel, Netlify official integrations)
		const bySha = await queryDeploymentUrl(worktreePath, nwo, `sha=${headSha}`);
		if (bySha) return bySha;

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
