import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckItem, GitHubStatus } from "@superset/local-db";
import { z } from "zod";
import { branchExistsOnRemote } from "../git";
import { execWithShellEnv } from "../shell-env";
import {
	GHCheckContextSchema,
	type GHPRResponse,
	GHPRResponseSchema,
	GHRepoResponseSchema,
} from "./types";

const execFileAsync = promisify(execFile);

// Cache for GitHub status (10 second TTL)
const cache = new Map<string, { data: GitHubStatus; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

// Cache for batch PR list per repo (30 second TTL)
const prListCache = new Map<
	string,
	{ data: Map<string, GHPRListItem>; timestamp: number }
>();
const PR_LIST_CACHE_TTL_MS = 30_000;

// Schema for gh pr list response (extends GHPRResponse with headRefName)
const GHPRListItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.enum(["OPEN", "CLOSED", "MERGED"]),
	isDraft: z.boolean(),
	headRefName: z.string(),
	mergedAt: z.string().nullable(),
	additions: z.number(),
	deletions: z.number(),
	reviewDecision: z
		.enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED", ""])
		.nullable(),
	statusCheckRollup: z.array(GHCheckContextSchema).nullable(),
});
const GHPRListSchema = z.array(GHPRListItemSchema);
type GHPRListItem = z.infer<typeof GHPRListItemSchema>;

/**
 * Fetches all open PRs for a repo in a single gh call.
 * Results are cached for 30 seconds per repo.
 */
async function fetchAllPRsForRepo(
	repoPath: string,
): Promise<Map<string, GHPRListItem>> {
	const cached = prListCache.get(repoPath);
	if (cached && Date.now() - cached.timestamp < PR_LIST_CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"list",
				"--author",
				"@me",
				"--state",
				"all",
				"--limit",
				"50",
				"--json",
				"number,title,url,state,isDraft,headRefName,mergedAt,additions,deletions,reviewDecision,statusCheckRollup",
			],
			{ cwd: repoPath },
		);

		const raw = JSON.parse(stdout);
		const result = GHPRListSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] PR list schema validation failed:", result.error);
			return new Map();
		}

		// Index by branch name for fast lookup
		const prMap = new Map<string, GHPRListItem>();
		for (const pr of result.data) {
			prMap.set(pr.headRefName, pr);
		}

		prListCache.set(repoPath, { data: prMap, timestamp: Date.now() });
		return prMap;
	} catch {
		return new Map();
	}
}

interface WorktreeInfo {
	workspaceId: string;
	worktreePath: string;
	branch: string;
	repoPath: string;
}

/**
 * Batch fetch GitHub PR status for multiple worktrees.
 * Groups by repo and fetches all PRs per repo in one call.
 */
export async function fetchGitHubPRStatusBatch(
	worktrees: WorktreeInfo[],
): Promise<Map<string, GitHubStatus | null>> {
	const results = new Map<string, GitHubStatus | null>();

	// Group worktrees by repo
	const byRepo = new Map<string, WorktreeInfo[]>();
	for (const wt of worktrees) {
		const existing = byRepo.get(wt.repoPath) ?? [];
		existing.push(wt);
		byRepo.set(wt.repoPath, existing);
	}

	// Fetch PRs for each repo in parallel
	await Promise.all(
		Array.from(byRepo.entries()).map(async ([repoPath, repoWorktrees]) => {
			const [repoUrl, prMap] = await Promise.all([
				getRepoUrl(repoPath),
				fetchAllPRsForRepo(repoPath),
			]);

			// Skip if we couldn't get repo URL
			if (!repoUrl) {
				for (const wt of repoWorktrees) {
					results.set(wt.workspaceId, null);
				}
				return;
			}

			// Check branch existence in parallel for all worktrees in this repo
			const branchChecks = await Promise.all(
				repoWorktrees.map((wt) =>
					branchExistsOnRemote(wt.worktreePath, wt.branch),
				),
			);

			for (let i = 0; i < repoWorktrees.length; i++) {
				const wt = repoWorktrees[i];
				const pr = prMap.get(wt.branch);
				const branchCheck = branchChecks[i];

				const status: GitHubStatus = {
					pr: pr ? convertPRListItemToStatus(pr) : null,
					repoUrl,
					branchExistsOnRemote: branchCheck.status === "exists",
					lastRefreshed: Date.now(),
				};

				results.set(wt.workspaceId, status);
				cache.set(wt.worktreePath, { data: status, timestamp: Date.now() });
			}
		}),
	);

	return results;
}

function convertPRListItemToStatus(
	pr: GHPRListItem,
): NonNullable<GitHubStatus["pr"]> {
	return {
		number: pr.number,
		title: pr.title,
		url: pr.url,
		state: mapPRState(pr.state, pr.isDraft),
		mergedAt: pr.mergedAt ? new Date(pr.mergedAt).getTime() : undefined,
		additions: pr.additions,
		deletions: pr.deletions,
		reviewDecision: mapReviewDecision(pr.reviewDecision),
		checksStatus: computeChecksStatus(pr.statusCheckRollup),
		checks: parseChecks(pr.statusCheckRollup),
	};
}

/**
 * Fetches GitHub PR status for a worktree using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 * Results are cached for 10 seconds.
 */
export async function fetchGitHubPRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	// Check cache first
	const cached = cache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		// First, get the repo URL
		const repoUrl = await getRepoUrl(worktreePath);
		if (!repoUrl) {
			return null;
		}

		// Get current branch name
		const { stdout: branchOutput } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd: worktreePath },
		);
		const branchName = branchOutput.trim();

		// Check if branch exists on remote and get PR info in parallel
		const [branchCheck, prInfo] = await Promise.all([
			branchExistsOnRemote(worktreePath, branchName),
			getPRForBranch(worktreePath, branchName),
		]);

		// Convert result to boolean - only "exists" is true
		// "not_found" and "error" both mean we can't confirm it exists
		const existsOnRemote = branchCheck.status === "exists";

		const result: GitHubStatus = {
			pr: prInfo,
			repoUrl,
			branchExistsOnRemote: existsOnRemote,
			lastRefreshed: Date.now(),
		};

		// Cache the result
		cache.set(worktreePath, { data: result, timestamp: Date.now() });

		return result;
	} catch {
		// Any error (gh not installed, not auth'd, etc.) - return null
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

async function getPRForBranch(
	worktreePath: string,
	branch: string,
): Promise<GitHubStatus["pr"]> {
	try {
		// Use execWithShellEnv to handle macOS GUI app PATH issues
		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"view",
				branch,
				"--json",
				"number,title,url,state,isDraft,mergedAt,additions,deletions,reviewDecision,statusCheckRollup",
			],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		const result = GHPRResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] PR schema validation failed:", result.error);
			console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
			throw new Error("PR schema validation failed");
		}
		const data = result.data;

		const checks = parseChecks(data.statusCheckRollup);

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
			checks,
		};
	} catch (error) {
		// "no pull requests found" is not an error - just no PR
		if (
			error instanceof Error &&
			error.message.includes("no pull requests found")
		) {
			return null;
		}
		// Re-throw other errors to be caught by parent
		throw error;
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

	return rollup.map((ctx) => {
		// CheckRun uses 'name', StatusContext uses 'context'
		const name = ctx.name || ctx.context || "Unknown check";
		// CheckRun uses 'detailsUrl', StatusContext uses 'targetUrl'
		const url = ctx.detailsUrl || ctx.targetUrl;
		// StatusContext uses 'state', CheckRun uses 'conclusion'
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
		// StatusContext uses 'state', CheckRun uses 'conclusion'
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
