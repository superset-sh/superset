import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { CheckItem, GitHubStatus } from "main/lib/db/schemas";

const execAsync = promisify(exec);

interface GHCheckContext {
	__typename: string;
	name?: string;
	context?: string; // StatusContext uses 'context' instead of 'name'
	state?: "SUCCESS" | "FAILURE" | "PENDING" | "ERROR";
	conclusion?:
		| "SUCCESS"
		| "FAILURE"
		| "CANCELLED"
		| "SKIPPED"
		| "TIMED_OUT"
		| "ACTION_REQUIRED"
		| "NEUTRAL"
		| null;
	detailsUrl?: string;
	targetUrl?: string; // StatusContext uses 'targetUrl' instead of 'detailsUrl'
}

interface GHPRResponse {
	number: number;
	title: string;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	mergedAt: string | null;
	additions: number;
	deletions: number;
	reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
	statusCheckRollup: {
		contexts: GHCheckContext[];
	} | null;
}

interface GHRepoResponse {
	url: string;
}

/**
 * Fetches GitHub PR status for a worktree using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 */
export async function fetchGitHubPRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	try {
		// First, get the repo URL
		const repoUrl = await getRepoUrl(worktreePath);
		if (!repoUrl) {
			return null;
		}

		// Try to get PR info for current branch
		const prInfo = await getPRForCurrentBranch(worktreePath);

		return {
			pr: prInfo,
			repoUrl,
			lastRefreshed: Date.now(),
		};
	} catch {
		// Any error (gh not installed, not auth'd, etc.) - return null
		return null;
	}
}

async function getRepoUrl(worktreePath: string): Promise<string | null> {
	try {
		const { stdout } = await execAsync("gh repo view --json url", {
			cwd: worktreePath,
		});
		const data = JSON.parse(stdout) as GHRepoResponse;
		return data.url;
	} catch {
		return null;
	}
}

async function getPRForCurrentBranch(
	worktreePath: string,
): Promise<GitHubStatus["pr"]> {
	try {
		// Get the current branch name explicitly (worktrees don't work well with gh's auto-detection)
		const { stdout: branchName } = await execAsync(
			"git rev-parse --abbrev-ref HEAD",
			{ cwd: worktreePath },
		);
		const branch = branchName.trim();

		const { stdout } = await execAsync(
			`gh pr view ${branch} --json number,title,url,state,isDraft,mergedAt,additions,deletions,reviewDecision,statusCheckRollup`,
			{ cwd: worktreePath },
		);
		const data = JSON.parse(stdout) as GHPRResponse;

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
	if (!rollup || !rollup.contexts || rollup.contexts.length === 0) {
		return [];
	}

	return rollup.contexts.map((ctx) => {
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
	if (!rollup || !rollup.contexts || rollup.contexts.length === 0) {
		return "none";
	}

	let hasFailure = false;
	let hasPending = false;

	for (const ctx of rollup.contexts) {
		// StatusContext uses 'state', CheckRun uses 'conclusion'
		const status = ctx.state || ctx.conclusion;

		if (status === "FAILURE" || status === "ERROR" || status === "TIMED_OUT") {
			hasFailure = true;
		} else if (
			status === "PENDING" ||
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
