import type {
	GitHubCheckRunNode,
	GitHubStatusContextNode,
} from "../../pull-requests/utils/github-query/types";
import type { PullRequestNode, RepoRef } from "../types";

// ---------------------------------------------------------------------------
// GitLab REST v4 raw shapes (validated against a live self-managed instance)
// ---------------------------------------------------------------------------

export interface GitLabMergeRequest {
	iid: number;
	title: string;
	web_url: string;
	state: "opened" | "closed" | "merged" | "locked";
	draft: boolean;
	sha: string;
	source_branch: string;
	target_branch: string;
	source_project_id: number;
	target_project_id: number;
	detailed_merge_status: string;
	blocking_discussions_resolved: boolean;
	has_conflicts: boolean;
	author: { username: string };
	created_at: string;
	updated_at: string;
	merged_at: string | null;
}

export interface GitLabPipelineJob {
	id: number;
	name: string;
	status:
		| "success"
		| "failed"
		| "canceled"
		| "running"
		| "pending"
		| "skipped"
		| "created"
		| "manual";
	stage: string;
	web_url: string;
	started_at: string | null;
	finished_at: string | null;
	allow_failure: boolean;
}

export interface GitLabPipeline {
	id: number;
	status: string;
	ref: string;
	sha: string;
}

export interface GitLabCommitStatus {
	id: number;
	name: string;
	status: string;
	target_url: string | null;
	description: string | null;
	finished_at: string | null;
	allow_failure: boolean;
}

// ---------------------------------------------------------------------------
// MR → PullRequestNode
// ---------------------------------------------------------------------------

export function mapMergeRequestToNode(
	mr: GitLabMergeRequest,
	repo: RepoRef,
): PullRequestNode {
	const state: PullRequestNode["state"] =
		mr.state === "merged"
			? "MERGED"
			: mr.state === "closed"
				? "CLOSED"
				: "OPEN";

	const isCrossRepository = mr.source_project_id !== mr.target_project_id;

	return {
		number: mr.iid,
		title: mr.title,
		url: mr.web_url,
		state,
		isDraft: mr.draft,
		headRefName: mr.source_branch,
		headRefOid: mr.sha,
		isCrossRepository,
		// TODO(phase3): resolve fork source project path
		headRepositoryOwner: isCrossRepository ? null : { login: repo.owner },
		headRepository: isCrossRepository ? null : { name: repo.name },
		updatedAt: mr.updated_at,
	};
}

// ---------------------------------------------------------------------------
// Job status → CheckRun status/conclusion mapping
// ---------------------------------------------------------------------------

function mapJobStatusToCheckRun(
	status: GitLabPipelineJob["status"],
): Pick<GitHubCheckRunNode, "status" | "conclusion"> {
	switch (status) {
		case "success":
			return { status: "COMPLETED", conclusion: "SUCCESS" };
		case "failed":
			return { status: "COMPLETED", conclusion: "FAILURE" };
		case "canceled":
			return { status: "COMPLETED", conclusion: "CANCELLED" };
		case "skipped":
			return { status: "COMPLETED", conclusion: "SKIPPED" };
		case "running":
			return { status: "IN_PROGRESS", conclusion: null };
		default:
			return { status: "QUEUED", conclusion: null };
	}
}

/** Map GitLab pipeline jobs to CheckRun nodes that `parseCheckContexts` reads. */
export function mapJobsToChecks(
	jobs: GitLabPipelineJob[],
): GitHubCheckRunNode[] {
	return jobs.map((job) => {
		const { status, conclusion } = mapJobStatusToCheckRun(job.status);
		return {
			__typename: "CheckRun" as const,
			name: job.name,
			status,
			conclusion,
			detailsUrl: job.web_url,
			startedAt: job.started_at,
			completedAt: job.finished_at,
			checkSuite: null,
		};
	});
}

// ---------------------------------------------------------------------------
// Commit status state → StatusContext state mapping
// ---------------------------------------------------------------------------

function mapCommitStatusState(gitlabState: string): string {
	switch (gitlabState) {
		case "success":
			return "SUCCESS";
		case "failed":
		case "error":
			return "FAILURE";
		default:
			return "PENDING";
	}
}

/** Map GitLab commit statuses to StatusContext nodes that `parseCheckContexts` reads. */
export function mapCommitStatusesToChecks(
	statuses: GitLabCommitStatus[],
): GitHubStatusContextNode[] {
	return statuses.map((s) => ({
		__typename: "StatusContext" as const,
		context: s.name,
		state: mapCommitStatusState(s.status),
		targetUrl: s.target_url,
		createdAt: s.finished_at,
	}));
}
