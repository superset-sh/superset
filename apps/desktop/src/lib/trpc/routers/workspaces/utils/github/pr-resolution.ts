import type { CheckItem, GitHubStatus } from "@superset/local-db";
import { execGitWithShellPath } from "../git-client";
import { execWithShellEnv } from "../shell-env";
import { getPullRequestRepoArgs } from "./repo-context";
import {
	type GHPRResponse,
	GHPRResponseSchema,
	type RepoContext,
} from "./types";

const PR_JSON_FIELDS =
	"number,title,url,state,isDraft,mergedAt,additions,deletions,headRefOid,headRefName,headRepository,headRepositoryOwner,isCrossRepository,reviewDecision,statusCheckRollup,reviewRequests";

export async function getPRForBranch(
	worktreePath: string,
	localBranch: string,
	repoContext?: RepoContext,
	headSha?: string,
): Promise<GitHubStatus["pr"]> {
	const byTracking = await getPRByBranchTracking(
		worktreePath,
		localBranch,
		headSha,
	);
	if (byTracking) {
		return byTracking;
	}

	const byHeadBranch = await findPRByHeadBranch(
		worktreePath,
		localBranch,
		repoContext,
		headSha,
	);
	if (byHeadBranch) {
		return byHeadBranch;
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

export function getPRHeadBranchCandidates(localBranch: string): string[] {
	const strippedBranch = localBranch.includes("/")
		? localBranch.slice(localBranch.indexOf("/") + 1)
		: localBranch;

	return Array.from(new Set([localBranch, strippedBranch].filter(Boolean)));
}

function getForkOwnerPrefix(
	localBranch: string,
	prHeadRefName: string,
): string | null {
	if (localBranch === prHeadRefName) {
		return null;
	}

	const suffix = `/${prHeadRefName}`;
	if (!localBranch.endsWith(suffix)) {
		return null;
	}

	const prefix = localBranch.slice(0, -suffix.length).trim();
	return prefix ? prefix.toLowerCase() : null;
}

export function prMatchesLocalBranch(
	localBranch: string,
	pr: Pick<GHPRResponse, "headRefName" | "headRepositoryOwner">,
): boolean {
	if (!branchMatchesPR(localBranch, pr.headRefName)) {
		return false;
	}

	const ownerPrefix = getForkOwnerPrefix(localBranch, pr.headRefName);
	if (!ownerPrefix) {
		return localBranch === pr.headRefName;
	}

	return pr.headRepositoryOwner?.login?.toLowerCase() === ownerPrefix;
}

function isHistoricalPullRequestState(state: GHPRResponse["state"]): boolean {
	return state === "CLOSED" || state === "MERGED";
}

export function shouldAcceptPRMatch({
	localBranch,
	pr,
	headSha,
}: {
	localBranch: string;
	pr: Pick<
		GHPRResponse,
		"headRefName" | "headRefOid" | "headRepositoryOwner" | "state"
	>;
	headSha?: string;
}): boolean {
	if (!prMatchesLocalBranch(localBranch, pr)) {
		return false;
	}

	// Historical PRs should only attach when this workspace still points at the
	// exact PR head commit. Otherwise, reusing a branch name can surface an old,
	// unrelated closed or merged PR.
	if (headSha && isHistoricalPullRequestState(pr.state)) {
		return pr.headRefOid === headSha;
	}

	return true;
}

function sortPRCandidates(
	candidates: GHPRResponse[],
	headSha?: string,
): GHPRResponse[] {
	const getStateRank = (candidate: GHPRResponse): number => {
		if (candidate.state === "OPEN") return 2;
		if (candidate.state === "MERGED") return 1;
		return 0;
	};

	return [...candidates].sort((left, right) => {
		const leftMatchesHead = Number(
			Boolean(headSha && left.headRefOid === headSha),
		);
		const rightMatchesHead = Number(
			Boolean(headSha && right.headRefOid === headSha),
		);
		if (leftMatchesHead !== rightMatchesHead) {
			return rightMatchesHead - leftMatchesHead;
		}

		const stateDelta = getStateRank(right) - getStateRank(left);
		if (stateDelta !== 0) {
			return stateDelta;
		}

		const leftMergedAt = left.mergedAt ? Date.parse(left.mergedAt) : 0;
		const rightMergedAt = right.mergedAt ? Date.parse(right.mergedAt) : 0;
		if (leftMergedAt !== rightMergedAt) {
			return rightMergedAt - leftMergedAt;
		}

		return right.number - left.number;
	});
}

/**
 * Looks up a PR using `gh pr view` (no args), which matches via the branch's
 * tracking ref. Essential for fork PRs that track refs/pull/XXX/head.
 */
async function getPRByBranchTracking(
	worktreePath: string,
	localBranch: string,
	headSha?: string,
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
		if (!shouldAcceptPRMatch({ localBranch, pr: data, headSha })) {
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
 * Looks up PRs by exact head branch name. This avoids relying on `gh pr view`
 * branch inference, which can miss fork-tracked branches in some clones.
 */
async function findPRByHeadBranch(
	worktreePath: string,
	localBranch: string,
	repoContext?: RepoContext,
	headSha?: string,
): Promise<GitHubStatus["pr"]> {
	try {
		const matches = new Map<number, GHPRResponse>();

		for (const branchCandidate of getPRHeadBranchCandidates(localBranch)) {
			const { stdout } = await execWithShellEnv(
				"gh",
				[
					"pr",
					"list",
					...getPullRequestRepoArgs(repoContext),
					"--state",
					"all",
					"--head",
					branchCandidate,
					"--limit",
					"20",
					"--json",
					PR_JSON_FIELDS,
				],
				{ cwd: worktreePath },
			);

			for (const candidate of parsePRListResponse(stdout)) {
				if (shouldAcceptPRMatch({ localBranch, pr: candidate, headSha })) {
					matches.set(candidate.number, candidate);
				}
			}
		}

		const bestMatch = sortPRCandidates([...matches.values()], headSha)[0];
		return bestMatch ? formatPRData(bestMatch) : null;
	} catch {
		return null;
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
		const exactHeadMatches = candidates.filter(
			(candidate) => candidate.headRefOid === headSha,
		);
		const bestMatch = sortPRCandidates(exactHeadMatches, headSha)[0];
		if (bestMatch) {
			return formatPRData(bestMatch);
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
		headRefName: data.headRefName,
		headRepositoryOwner: data.headRepositoryOwner?.login,
		headRepositoryName: data.headRepository?.name,
		isCrossRepository: data.isCrossRepository,
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
