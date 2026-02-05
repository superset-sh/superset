import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckItem, GitHubStatus } from "@superset/local-db";
import { branchExistsOnRemote } from "../git";
import { execWithShellEnv } from "../shell-env";
import {
	type GHPRResponse,
	GHPRResponseSchema,
	GHRepoResponseSchema,
} from "./types";

const execFileAsync = promisify(execFile);

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
		const repoUrl = await getRepoUrl(worktreePath);
		if (!repoUrl) {
			return null;
		}

		const { stdout: branchOutput } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd: worktreePath },
		);
		const branchName = branchOutput.trim();

		const [branchCheck, prInfo] = await Promise.all([
			branchExistsOnRemote(worktreePath, branchName),
			getPRForBranch(worktreePath),
		]);

		const result: GitHubStatus = {
			pr: prInfo,
			repoUrl,
			branchExistsOnRemote: branchCheck.status === "exists",
			lastRefreshed: Date.now(),
		};

		cache.set(worktreePath, { data: result, timestamp: Date.now() });

		return result;
	} catch {
		return null;
	}
}

async function getRepoUrl(worktreePath: string): Promise<string | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["repo", "view", "--json", "url"],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		const result = GHRepoResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] Repo schema validation failed:", result.error);
			console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
			return null;
		}
		return result.data.url;
	} catch {
		return null;
	}
}

const PR_JSON_FIELDS =
	"number,title,url,state,isDraft,mergedAt,additions,deletions,headRefOid,reviewDecision,statusCheckRollup";

async function getPRForBranch(
	worktreePath: string,
): Promise<GitHubStatus["pr"]> {
	// Try branch-based lookup first, then fall back to commit-based search.
	// Branch-based is fast but fails when the branch was renamed after PR creation.
	const branchResult = await getPRByBranchTracking(worktreePath);
	if (branchResult !== undefined) {
		return branchResult;
	}

	return findPRByHeadCommit(worktreePath);
}

/**
 * Looks up a PR using `gh pr view` (no args), which matches via the branch's
 * tracking ref. Essential for fork PRs that track refs/pull/XXX/head.
 * Returns the PR, null (no match), or undefined (branch name mismatch — caller should try commit-based).
 */
async function getPRByBranchTracking(
	worktreePath: string,
): Promise<GitHubStatus["pr"] | undefined> {
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

		// `gh pr view` matches by branch name, which can find a stale PR if the
		// branch was recreated. Verify shared commit ancestry to confirm the match.
		if (!(await sharesAncestry(worktreePath, data.headRefOid))) {
			return null;
		}

		return formatPRData(data);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("no pull requests found")
		) {
			// Branch name didn't match any PR — signal caller to try commit-based
			return undefined;
		}
		throw error;
	}
}

/**
 * Finds a PR by searching GitHub for the local HEAD commit SHA.
 * Handles cases where the branch was renamed after PR creation.
 */
async function findPRByHeadCommit(
	worktreePath: string,
): Promise<GitHubStatus["pr"]> {
	try {
		const { stdout: headOutput } = await execFileAsync(
			"git",
			["-C", worktreePath, "rev-parse", "HEAD"],
			{ timeout: 10_000 },
		);
		const headSha = headOutput.trim();

		const { stdout: searchOutput } = await execWithShellEnv(
			"gh",
			[
				"api",
				`search/issues?q=${headSha}+type:pr+repo:{owner}/{repo}`,
				"--jq",
				".items[].number",
			],
			{ cwd: worktreePath },
		);

		const prNumbers = searchOutput
			.trim()
			.split("\n")
			.filter(Boolean)
			.map(Number);
		if (prNumbers.length === 0) {
			return null;
		}

		// Check each candidate PR — prefer one whose headRefOid matches exactly
		for (const prNumber of prNumbers) {
			try {
				const { stdout } = await execWithShellEnv(
					"gh",
					["pr", "view", String(prNumber), "--json", PR_JSON_FIELDS],
					{ cwd: worktreePath },
				);

				const data = parsePRResponse(stdout);
				if (!data) {
					continue;
				}

				if (await sharesAncestry(worktreePath, data.headRefOid)) {
					return formatPRData(data);
				}
			} catch {}
		}

		return null;
	} catch {
		return null;
	}
}

function parsePRResponse(stdout: string): GHPRResponse | null {
	const raw = JSON.parse(stdout);
	const result = GHPRResponseSchema.safeParse(raw);
	if (!result.success) {
		console.error("[GitHub] PR schema validation failed:", result.error);
		console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
		return null;
	}
	return result.data;
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
	};
}

/**
 * Returns true if local HEAD and the given commit share ancestry
 * (one is an ancestor of the other, or they are the same commit).
 * Falls back to true when ancestry can't be verified (e.g., commit not fetched).
 */
async function sharesAncestry(
	worktreePath: string,
	prHeadOid: string,
): Promise<boolean> {
	try {
		const { stdout: localHead } = await execFileAsync(
			"git",
			["-C", worktreePath, "rev-parse", "HEAD"],
			{ timeout: 10_000 },
		);
		const localOid = localHead.trim();

		if (localOid === prHeadOid) {
			return true;
		}

		// Check both directions: local ahead of PR, and PR ahead of local
		for (const [ancestor, descendant] of [
			[prHeadOid, localOid],
			[localOid, prHeadOid],
		]) {
			try {
				await execFileAsync(
					"git",
					[
						"-C",
						worktreePath,
						"merge-base",
						"--is-ancestor",
						ancestor,
						descendant,
					],
					{ timeout: 10_000 },
				);
				return true;
			} catch {
				// Not an ancestor in this direction
			}
		}

		return false;
	} catch (error) {
		console.warn(
			"[GitHub] Could not verify PR commit ancestry:",
			error instanceof Error ? error.message : String(error),
		);
		return true;
	}
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
