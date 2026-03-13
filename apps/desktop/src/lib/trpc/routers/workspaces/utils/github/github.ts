import type { CheckItem, GitHubStatus } from "@superset/local-db";
import { branchExistsOnRemote } from "../git";
import { execGitWithShellPath } from "../git-client";
import { execWithShellEnv } from "../shell-env";
import {
	GHDeploymentSchema,
	GHDeploymentStatusSchema,
	type GHPRResponse,
	GHPRResponseSchema,
	GHRepoResponseSchema,
	type RepoContext,
} from "./types";

const cache = new Map<string, { data: GitHubStatus; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

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

		const [{ stdout: branchOutput }, { stdout: shaOutput }] = await Promise.all(
			[
				execGitWithShellPath(["rev-parse", "--abbrev-ref", "HEAD"], {
					cwd: worktreePath,
				}),
				execGitWithShellPath(["rev-parse", "HEAD"], { cwd: worktreePath }),
			],
		);
		const branchName = branchOutput.trim();
		const headSha = shaOutput.trim();

		const [branchCheck, prInfo, previewUrl] = await Promise.all([
			branchExistsOnRemote(worktreePath, branchName),
			getPRForBranch(worktreePath, branchName, repoContext, headSha),
			fetchPreviewDeploymentUrl(worktreePath, headSha, branchName, repoContext),
		]);

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

const repoContextCache = new Map<
	string,
	{ data: RepoContext; timestamp: number }
>();
const REPO_CONTEXT_CACHE_TTL_MS = 300_000; // 5 minutes

export async function getRepoContext(
	worktreePath: string,
): Promise<RepoContext | null> {
	const cached = repoContextCache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < REPO_CONTEXT_CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["repo", "view", "--json", "url,isFork,parent"],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		const result = GHRepoResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] Repo schema validation failed:", result.error);
			console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
			return null;
		}

		const data = result.data;
		let context: RepoContext;

		if (data.isFork && data.parent) {
			context = {
				repoUrl: data.url,
				upstreamUrl: data.parent.url,
				isFork: true,
			};
		} else {
			const originUrl = await getOriginUrl(worktreePath);
			const ghUrl = normalizeGitHubUrl(data.url);

			if (originUrl && ghUrl && originUrl !== ghUrl) {
				context = {
					repoUrl: originUrl,
					upstreamUrl: ghUrl,
					isFork: true,
				};
			} else {
				context = {
					repoUrl: data.url,
					upstreamUrl: data.url,
					isFork: false,
				};
			}
		}

		repoContextCache.set(worktreePath, {
			data: context,
			timestamp: Date.now(),
		});
		return context;
	} catch {
		return null;
	}
}

async function getOriginUrl(worktreePath: string): Promise<string | null> {
	try {
		const { stdout } = await execGitWithShellPath(
			["remote", "get-url", "origin"],
			{ cwd: worktreePath },
		);
		return normalizeGitHubUrl(stdout.trim());
	} catch {
		return null;
	}
}

function normalizeGitHubUrl(remoteUrl: string): string | null {
	const trimmed = remoteUrl.trim();
	const patterns = [
		/^git@github\.com:(?<nwo>[^/]+\/[^/]+?)(?:\.git)?$/,
		/^ssh:\/\/git@github\.com\/(?<nwo>[^/]+\/[^/]+?)(?:\.git)?$/,
		/^https:\/\/github\.com\/(?<nwo>[^/]+\/[^/]+?)(?:\.git)?\/?$/,
	];
	for (const pattern of patterns) {
		const match = pattern.exec(trimmed);
		if (match?.groups?.nwo) {
			return `https://github.com/${match.groups.nwo}`;
		}
	}
	return null;
}

function isSafeHttpUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function extractNwoFromUrl(normalizedUrl: string): string | null {
	try {
		const path = new URL(normalizedUrl).pathname.slice(1);
		return path || null;
	} catch {
		return null;
	}
}

export function getPullRequestRepoArgs(
	repoContext?: Pick<RepoContext, "isFork" | "upstreamUrl"> | null,
): string[] {
	if (!repoContext?.isFork) {
		return [];
	}

	const normalizedUpstreamUrl = normalizeGitHubUrl(repoContext.upstreamUrl);
	if (!normalizedUpstreamUrl) {
		return [];
	}

	const repoNameWithOwner = extractNwoFromUrl(normalizedUpstreamUrl);
	return repoNameWithOwner ? ["--repo", repoNameWithOwner] : [];
}

const PR_JSON_FIELDS =
	"number,title,url,state,isDraft,mergedAt,additions,deletions,headRefOid,headRefName,reviewDecision,statusCheckRollup,reviewRequests";

async function getPRForBranch(
	worktreePath: string,
	localBranch: string,
	repoContext?: RepoContext,
	headSha?: string,
): Promise<GitHubStatus["pr"]> {
	const byTracking = await getPRByBranchTracking(worktreePath, localBranch);
	if (byTracking) {
		return byTracking;
	}

	return findPRByHeadCommit(worktreePath, repoContext, headSha);
}

/**
 * Returns true when the local branch name matches the PR's head branch.
 * Handles fork PRs where the local branch is prefixed with the fork owner
 * (e.g. local "owner/feature" matches PR headRefName "feature").
 */
export function branchMatchesPR(
	localBranch: string,
	prHeadRefName: string,
): boolean {
	return (
		localBranch === prHeadRefName || localBranch.endsWith(`/${prHeadRefName}`)
	);
}

/**
 * Looks up a PR using `gh pr view` (no args), which matches via the branch's
 * tracking ref. Essential for fork PRs that track refs/pull/XXX/head.
 */
async function getPRByBranchTracking(
	worktreePath: string,
	localBranch: string,
): Promise<GitHubStatus["pr"]> {
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["pr", "view", "--json", PR_JSON_FIELDS],
			{ cwd: worktreePath },
		);

		const data = parsePRResponse(stdout);
		if (!data) {
			return null;
		}

		// Verify the PR's head branch matches the local branch.
		// `gh pr view` can match via stale tracking refs (e.g. refs/pull/N/head)
		// left over from a previous `gh pr checkout`, causing a new workspace
		// to incorrectly show an old, unrelated PR.
		if (!branchMatchesPR(localBranch, data.headRefName)) {
			return null;
		}

		return formatPRData(data);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("no pull requests found")
		) {
			return null;
		}
		throw error;
	}
}

/**
 * Looks up PRs that have local HEAD as their head commit.
 * This avoids matching unrelated PRs that merely contain the same commit.
 */
async function findPRByHeadCommit(
	worktreePath: string,
	repoContext?: RepoContext,
	providedSha?: string,
): Promise<GitHubStatus["pr"]> {
	try {
		let headSha = providedSha;
		if (!headSha) {
			const { stdout: headOutput } = await execGitWithShellPath(
				["rev-parse", "HEAD"],
				{ cwd: worktreePath },
			);
			headSha = headOutput.trim();
		}
		if (!headSha) {
			return null;
		}

		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"list",
				...getPullRequestRepoArgs(repoContext),
				"--state",
				"all",
				"--search",
				`${headSha} is:pr`,
				"--limit",
				"20",
				"--json",
				PR_JSON_FIELDS,
			],
			{ cwd: worktreePath },
		);

		const candidates = parsePRListResponse(stdout);
		for (const candidate of candidates) {
			if (candidate.headRefOid === headSha) {
				return formatPRData(candidate);
			}
		}

		return null;
	} catch {
		return null;
	}
}

function parsePRResponse(stdout: string): GHPRResponse | null {
	const trimmed = stdout.trim();
	if (!trimmed || trimmed === "null") {
		return null;
	}

	let raw: unknown;
	try {
		raw = JSON.parse(trimmed);
	} catch (error) {
		console.warn(
			"[GitHub] Failed to parse PR response JSON:",
			error instanceof Error ? error.message : String(error),
		);
		return null;
	}
	const result = GHPRResponseSchema.safeParse(raw);
	if (!result.success) {
		console.error("[GitHub] PR schema validation failed:", result.error);
		console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
		return null;
	}
	return result.data;
}

function parsePRListResponse(stdout: string): GHPRResponse[] {
	const trimmed = stdout.trim();
	if (!trimmed || trimmed === "null") {
		return [];
	}

	let raw: unknown;
	try {
		raw = JSON.parse(trimmed);
	} catch (error) {
		console.warn(
			"[GitHub] Failed to parse PR list response JSON:",
			error instanceof Error ? error.message : String(error),
		);
		return [];
	}

	if (!Array.isArray(raw)) {
		return [];
	}

	const parsed: GHPRResponse[] = [];
	for (const item of raw) {
		const result = GHPRResponseSchema.safeParse(item);
		if (result.success) {
			parsed.push(result.data);
		}
	}
	return parsed;
}

function formatPRData(data: GHPRResponse): NonNullable<GitHubStatus["pr"]> {
	return {
		number: data.number,
		title: data.title,
		url: data.url,
		state: mapPRState(data.state, data.isDraft),
		mergedAt: data.mergedAt ? new Date(data.mergedAt).getTime() : undefined,
		additions: data.additions,
		deletions: data.deletions,
		reviewDecision: mapReviewDecision(data.reviewDecision),
		checksStatus: computeChecksStatus(data.statusCheckRollup),
		checks: parseChecks(data.statusCheckRollup),
		requestedReviewers: parseReviewRequests(data.reviewRequests),
	};
}

function parseReviewRequests(
	requests: GHPRResponse["reviewRequests"],
): string[] {
	if (!requests || requests.length === 0) return [];
	return requests.map((r) => r.login || r.slug || r.name || "").filter(Boolean);
}

function mapPRState(
	state: GHPRResponse["state"],
	isDraft: boolean,
): NonNullable<GitHubStatus["pr"]>["state"] {
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	if (isDraft) return "draft";
	return "open";
}

function mapReviewDecision(
	decision: GHPRResponse["reviewDecision"],
): NonNullable<GitHubStatus["pr"]>["reviewDecision"] {
	if (decision === "APPROVED") return "approved";
	if (decision === "CHANGES_REQUESTED") return "changes_requested";
	return "pending";
}

function parseChecks(rollup: GHPRResponse["statusCheckRollup"]): CheckItem[] {
	if (!rollup || rollup.length === 0) {
		return [];
	}

	// GitHub returns two shapes: CheckRun (name/detailsUrl/conclusion) and
	// StatusContext (context/targetUrl/state). Normalize both here.
	return rollup.map((ctx) => {
		const name = ctx.name || ctx.context || "Unknown check";
		const url = ctx.detailsUrl || ctx.targetUrl;
		const rawStatus = ctx.state || ctx.conclusion;

		let status: CheckItem["status"];
		if (rawStatus === "SUCCESS") {
			status = "success";
		} else if (
			rawStatus === "FAILURE" ||
			rawStatus === "ERROR" ||
			rawStatus === "TIMED_OUT"
		) {
			status = "failure";
		} else if (rawStatus === "SKIPPED" || rawStatus === "NEUTRAL") {
			status = "skipped";
		} else if (rawStatus === "CANCELLED") {
			status = "cancelled";
		} else {
			status = "pending";
		}

		return { name, status, url };
	});
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
				if (!Array.isArray(rawStatuses) || rawStatuses.length === 0)
					return undefined;
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
	return urls.find((u): u is string => u !== undefined);
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

function computeChecksStatus(
	rollup: GHPRResponse["statusCheckRollup"],
): NonNullable<GitHubStatus["pr"]>["checksStatus"] {
	if (!rollup || rollup.length === 0) {
		return "none";
	}

	let hasFailure = false;
	let hasPending = false;

	for (const ctx of rollup) {
		const status = ctx.state || ctx.conclusion;

		if (status === "FAILURE" || status === "ERROR" || status === "TIMED_OUT") {
			hasFailure = true;
		} else if (
			status === "PENDING" ||
			status === "" ||
			status === null ||
			status === undefined
		) {
			hasPending = true;
		}
	}

	if (hasFailure) return "failure";
	if (hasPending) return "pending";
	return "success";
}
