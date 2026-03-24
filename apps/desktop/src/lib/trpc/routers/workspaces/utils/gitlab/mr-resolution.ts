import type { CheckItem, GitHubStatus } from "@superset/local-db";
import { execWithShellEnv } from "../shell-env";
import {
	type GitLabRepoContext,
	GLApprovalsResponseSchema,
	GLJobSchema,
	type GLMRResponse,
	GLMRResponseSchema,
	GLPipelineSchema,
} from "./types";

/**
 * Finds the MR associated with the current branch, trying multiple strategies:
 * 1. `glab mr view` (uses current branch tracking)
 * 2. `glab mr list --source-branch` (explicit branch search)
 */
export async function getMRForBranch(
	worktreePath: string,
	localBranch: string,
	repoContext: GitLabRepoContext,
	headSha?: string,
): Promise<GitHubStatus["pr"]> {
	const byView = await getMRByView(
		worktreePath,
		localBranch,
		repoContext.projectPath,
	);
	if (byView) {
		return byView;
	}

	return findMRBySourceBranch(worktreePath, localBranch, repoContext, headSha);
}

async function getMRByView(
	worktreePath: string,
	localBranch: string,
	projectPath: string,
): Promise<GitHubStatus["pr"]> {
	try {
		const { stdout } = await execWithShellEnv(
			"glab",
			["mr", "view", "--output", "json"],
			{ cwd: worktreePath },
		);

		const data = parseMRResponse(stdout);
		if (!data) {
			return null;
		}

		// Verify the MR's source branch matches
		if (data.source_branch !== localBranch) {
			return null;
		}

		return formatMRData(worktreePath, data, projectPath);
	} catch (error) {
		if (
			error instanceof Error &&
			(error.message.toLowerCase().includes("no merge requests found") ||
				error.message.toLowerCase().includes("no open merge request"))
		) {
			return null;
		}
		console.warn(
			"[GitLab] getMRByView failed:",
			error instanceof Error ? error.message : String(error),
		);
		return null;
	}
}

async function findMRBySourceBranch(
	worktreePath: string,
	localBranch: string,
	repoContext: GitLabRepoContext,
	headSha?: string,
): Promise<GitHubStatus["pr"]> {
	try {
		const { stdout } = await execWithShellEnv(
			"glab",
			[
				"mr",
				"list",
				"--source-branch",
				localBranch,
				"--state",
				"all",
				"--output",
				"json",
			],
			{ cwd: worktreePath },
		);

		const candidates = parseMRListResponse(stdout);
		if (candidates.length === 0) {
			return null;
		}

		const sorted = sortMRCandidates(candidates, headSha);
		const best = sorted[0];
		return best
			? formatMRData(worktreePath, best, repoContext.projectPath)
			: null;
	} catch (error) {
		console.warn(
			"[GitLab] findMRBySourceBranch failed:",
			error instanceof Error ? error.message : String(error),
		);
		return null;
	}
}

function sortMRCandidates(
	candidates: GLMRResponse[],
	headSha?: string,
): GLMRResponse[] {
	const getStateRank = (mr: GLMRResponse): number => {
		if (mr.state === "opened") return 2;
		if (mr.state === "merged") return 1;
		return 0;
	};

	return [...candidates].sort((a, b) => {
		// Prefer SHA match
		const aMatchesSha = Number(Boolean(headSha && a.sha === headSha));
		const bMatchesSha = Number(Boolean(headSha && b.sha === headSha));
		if (aMatchesSha !== bMatchesSha) {
			return bMatchesSha - aMatchesSha;
		}

		// Prefer open > merged > closed
		const stateDelta = getStateRank(b) - getStateRank(a);
		if (stateDelta !== 0) {
			return stateDelta;
		}

		// Most recently merged first
		const aMergedAt = a.merged_at ? Date.parse(a.merged_at) : 0;
		const bMergedAt = b.merged_at ? Date.parse(b.merged_at) : 0;
		if (aMergedAt !== bMergedAt) {
			return bMergedAt - aMergedAt;
		}

		return b.iid - a.iid;
	});
}

async function formatMRData(
	worktreePath: string,
	data: GLMRResponse,
	projectPath: string,
): Promise<NonNullable<GitHubStatus["pr"]>> {
	const [reviewDecision] = await fetchApprovalStatus(
		worktreePath,
		data.iid,
		projectPath,
	);
	const [checksStatus, checks] = await fetchPipelineChecks(
		worktreePath,
		data.iid,
		projectPath,
	);

	const requestedReviewers =
		data.reviewers?.map((r) => r.username).filter(Boolean) ?? [];

	return {
		number: data.iid,
		title: data.title,
		url: data.web_url,
		state: mapMRState(data.state, data.draft),
		mergedAt: data.merged_at ? new Date(data.merged_at).getTime() : undefined,
		additions: data.diff_stats?.additions ?? 0,
		deletions: data.diff_stats?.deletions ?? 0,
		headRefName: data.source_branch,
		reviewDecision,
		checksStatus,
		checks,
		requestedReviewers,
	};
}

function mapMRState(
	state: GLMRResponse["state"],
	isDraft: boolean,
): NonNullable<GitHubStatus["pr"]>["state"] {
	if (state === "merged") return "merged";
	if (state === "closed" || state === "locked") return "closed";
	if (isDraft) return "draft";
	return "open";
}

async function fetchApprovalStatus(
	worktreePath: string,
	mrIid: number,
	projectPath: string,
): Promise<[NonNullable<GitHubStatus["pr"]>["reviewDecision"]]> {
	try {
		const { stdout } = await execWithShellEnv(
			"glab",
			["api", `projects/${projectPath}/merge_requests/${mrIid}/approvals`],
			{ cwd: worktreePath },
		);

		const raw: unknown = JSON.parse(stdout.trim());
		const result = GLApprovalsResponseSchema.safeParse(raw);
		if (!result.success) {
			return ["pending"];
		}

		const decision = result.data.approved ? "approved" : "pending";
		return [decision];
	} catch (error) {
		console.warn(
			"[GitLab] fetchApprovalStatus failed:",
			error instanceof Error ? error.message : String(error),
		);
		return ["pending"];
	}
}

async function fetchPipelineChecks(
	worktreePath: string,
	mrIid: number,
	projectPath: string,
): Promise<[NonNullable<GitHubStatus["pr"]>["checksStatus"], CheckItem[]]> {
	try {
		// Get pipelines for this MR
		const { stdout: pipelinesStdout } = await execWithShellEnv(
			"glab",
			["api", `projects/${projectPath}/merge_requests/${mrIid}/pipelines`],
			{ cwd: worktreePath },
		);

		const rawPipelines: unknown = JSON.parse(pipelinesStdout.trim());
		if (!Array.isArray(rawPipelines) || rawPipelines.length === 0) {
			return ["none", []];
		}

		// Use the latest pipeline
		const latestPipelineResult = GLPipelineSchema.safeParse(rawPipelines[0]);
		if (!latestPipelineResult.success) {
			return ["none", []];
		}

		const pipelineId = latestPipelineResult.data.id;

		// Get jobs for the latest pipeline (paginated)
		const allRawJobs: unknown[] = [];
		let jobPage = 1;
		while (true) {
			const { stdout: jobsStdout } = await execWithShellEnv(
				"glab",
				[
					"api",
					`projects/${projectPath}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=false&page=${jobPage}`,
				],
				{ cwd: worktreePath },
			);

			const pageJobs: unknown = JSON.parse(jobsStdout.trim());
			if (!Array.isArray(pageJobs) || pageJobs.length === 0) {
				break;
			}
			allRawJobs.push(...pageJobs);
			if (pageJobs.length < 100) break;
			jobPage++;
		}

		if (allRawJobs.length === 0) {
			// No jobs but pipeline exists — use pipeline-level status
			const pipelineStatus = mapPipelineStatusToChecksStatus(
				latestPipelineResult.data.status,
			);
			return [pipelineStatus, []];
		}

		const checks: CheckItem[] = [];
		let hasFailure = false;
		let hasPending = false;
		let hasSuccess = false;

		for (const rawJob of allRawJobs) {
			const jobResult = GLJobSchema.safeParse(rawJob);
			if (!jobResult.success) {
				continue;
			}

			const job = jobResult.data;
			const status = mapJobStatus(job.status);
			const durationText =
				job.duration != null ? formatDuration(job.duration) : undefined;

			checks.push({
				name: job.name,
				status,
				url: job.web_url,
				durationText,
			});

			if (status === "failure") hasFailure = true;
			if (status === "pending") hasPending = true;
			if (status === "success") hasSuccess = true;
		}

		const checksStatus: NonNullable<GitHubStatus["pr"]>["checksStatus"] =
			checks.length === 0
				? "none"
				: hasFailure
					? "failure"
					: hasPending
						? "pending"
						: hasSuccess
							? "success"
							: "none";

		return [checksStatus, checks];
	} catch (error) {
		console.warn(
			"[GitLab] fetchPipelineChecks failed:",
			error instanceof Error ? error.message : String(error),
		);
		return ["none", []];
	}
}

function mapPipelineStatusToChecksStatus(
	status: string,
): NonNullable<GitHubStatus["pr"]>["checksStatus"] {
	switch (status) {
		case "success":
			return "success";
		case "failed":
			return "failure";
		case "canceled":
		case "skipped":
			return "none";
		default:
			return "pending";
	}
}

function mapJobStatus(status: string): CheckItem["status"] {
	switch (status) {
		case "success":
			return "success";
		case "failed":
			return "failure";
		case "canceled":
			return "cancelled";
		case "skipped":
		case "manual":
			return "skipped";
		default:
			return "pending";
	}
}

function formatDuration(rawSeconds: number): string {
	const total = Math.round(rawSeconds);
	if (total < 60) {
		return `${total}s`;
	}
	const minutes = Math.floor(total / 60);
	const remainingSeconds = total % 60;
	return remainingSeconds > 0
		? `${minutes}m ${remainingSeconds}s`
		: `${minutes}m`;
}

function parseMRResponse(stdout: string): GLMRResponse | null {
	const trimmed = stdout.trim();
	if (!trimmed || trimmed === "null") {
		return null;
	}

	let raw: unknown;
	try {
		raw = JSON.parse(trimmed);
	} catch (error) {
		console.warn(
			"[GitLab] Failed to parse MR response JSON:",
			error instanceof Error ? error.message : String(error),
		);
		return null;
	}

	const result = GLMRResponseSchema.safeParse(raw);
	if (!result.success) {
		console.error("[GitLab] MR schema validation failed:", result.error);
		return null;
	}
	return result.data;
}

function parseMRListResponse(stdout: string): GLMRResponse[] {
	const trimmed = stdout.trim();
	if (!trimmed || trimmed === "null" || trimmed === "[]") {
		return [];
	}

	let raw: unknown;
	try {
		raw = JSON.parse(trimmed);
	} catch (error) {
		console.warn(
			"[GitLab] Failed to parse MR list response JSON:",
			error instanceof Error ? error.message : String(error),
		);
		return [];
	}

	if (!Array.isArray(raw)) {
		return [];
	}

	const parsed: GLMRResponse[] = [];
	for (const item of raw) {
		const result = GLMRResponseSchema.safeParse(item);
		if (result.success) {
			parsed.push(result.data);
		}
	}
	return parsed;
}
