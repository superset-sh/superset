import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckItem, GitHubStatus } from "main/lib/db/schemas";
import { branchExistsOnRemote } from "../git";
import {
	type GHPRResponse,
	GHPRResponseSchema,
	GHRepoResponseSchema,
} from "./types";

const execFileAsync = promisify(execFile);

// Cache for GitHub status (10 second TTL)
const cache = new Map<string, { data: GitHubStatus; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

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
		const [existsOnRemote, prInfo] = await Promise.all([
			branchExistsOnRemote(worktreePath, branchName),
			getPRForBranch(worktreePath, branchName),
		]);

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
		const { stdout } = await execFileAsync(
			"gh",
			["repo", "view", "--json", "url"],
			{
				cwd: worktreePath,
			},
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
		// Use execFile with args array to prevent command injection
		const { stdout } = await execFileAsync(
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
