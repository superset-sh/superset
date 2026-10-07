import { z } from "zod";
import { parseMergedAt } from "../../pull-requests/utils/github-query";
import type {
	CheckContextNode,
	CheckRun,
	PullRequestCheck,
	PullRequestNode,
	RepoRef,
	StatusCheck,
} from "../types";

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
	created_at?: string | null;
	pipeline?: { id: number };
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
	created_at?: string | null;
	pipeline_id?: number | null;
	finished_at: string | null;
	allow_failure: boolean;
}

export function mapMergeRequestToNode(
	mr: GitLabMergeRequest,
	repo: RepoRef,
	forkSource?: { owner: string; name: string } | null,
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
		headRepositoryOwner: isCrossRepository
			? forkSource
				? { login: forkSource.owner }
				: null
			: { login: repo.owner },
		headRepository: isCrossRepository
			? forkSource
				? { name: forkSource.name }
				: null
			: { name: repo.name },
		updatedAt: mr.updated_at,
		mergedAt: parseMergedAt(mr.merged_at),
	};
}

function mapJobStatusToCheckRun(
	status: GitLabPipelineJob["status"],
	allowFailure = false,
): Pick<CheckRun, "status" | "conclusion"> {
	switch (status) {
		case "success":
			return { status: "COMPLETED", conclusion: "SUCCESS" };
		case "failed":
			return {
				status: "COMPLETED",
				conclusion: allowFailure ? "NEUTRAL" : "FAILURE",
			};
		case "canceled":
			return { status: "COMPLETED", conclusion: "CANCELLED" };
		case "skipped":
			return { status: "COMPLETED", conclusion: "SKIPPED" };
		case "manual":
			return allowFailure
				? { status: "COMPLETED", conclusion: "SKIPPED" }
				: { status: "QUEUED", conclusion: null };
		case "running":
			return { status: "IN_PROGRESS", conclusion: null };
		default:
			return { status: "QUEUED", conclusion: null };
	}
}

export function mapJobsToChecks(
	jobs: GitLabPipelineJob[],
	pipelineId?: number,
): CheckRun[] {
	return jobs.map((job) => {
		const { status, conclusion } = mapJobStatusToCheckRun(
			job.status,
			job.allow_failure,
		);
		return {
			kind: "check" as const,
			databaseId: job.id,
			createdAt: job.created_at ?? null,
			name: job.name,
			status,
			conclusion,
			detailsUrl: job.web_url,
			startedAt: job.started_at,
			completedAt: job.finished_at,
			runGroupId: job.pipeline?.id ?? pipelineId ?? null,
		};
	});
}

function mapCommitStatusState(
	gitlabState: string,
	allowFailure: boolean,
): string {
	switch (gitlabState) {
		case "success":
			return "SUCCESS";
		case "failed":
		case "error":
			return allowFailure ? "NEUTRAL" : "FAILURE";
		case "manual":
			return allowFailure ? "SKIPPED" : "PENDING";
		case "skipped":
			return "SKIPPED";
		case "canceled":
			return "CANCELLED";
		default:
			return "PENDING";
	}
}

export function mapCommitStatusesToChecks(
	statuses: GitLabCommitStatus[],
): StatusCheck[] {
	return statuses.map((s) => ({
		kind: "status" as const,
		databaseId: s.id,
		runGroupId: s.pipeline_id ?? null,
		completedAt: s.finished_at,
		context: s.name,
		state: mapCommitStatusState(s.status, s.allow_failure),
		targetUrl: s.target_url,
		createdAt: s.created_at ?? null,
	}));
}

type GitLabCheckNode = NonNullable<CheckContextNode>;

function checkCreatedTime(node: GitLabCheckNode): number {
	const timestamp =
		node.createdAt ??
		node.completedAt ??
		(node.kind === "check" ? node.startedAt : null);
	return Date.parse(timestamp ?? "") || 0;
}

type GitLabCheckCandidate = {
	check: PullRequestCheck;
	node: GitLabCheckNode;
};

function checkSnapshotTime(node: GitLabCheckNode): number {
	return (
		Date.parse(
			node.completedAt ?? (node.kind === "check" ? (node.startedAt ?? "") : ""),
		) || 0
	);
}

function compareCheckTimes(
	candidate: GitLabCheckNode,
	existing: GitLabCheckNode,
): number {
	return (
		checkCreatedTime(candidate) - checkCreatedTime(existing) ||
		checkSnapshotTime(candidate) - checkSnapshotTime(existing)
	);
}

function compareCheckTies(
	candidate: GitLabCheckCandidate,
	existing: GitLabCheckCandidate,
): number {
	const priority = {
		failure: 4,
		cancelled: 3,
		pending: 2,
		skipped: 1,
		success: 0,
	};
	const outcomeOrder =
		priority[candidate.check.status] - priority[existing.check.status];
	if (outcomeOrder) return outcomeOrder;
	const candidateUrl = candidate.check.url;
	const existingUrl = existing.check.url;
	if (candidateUrl !== existingUrl) {
		if (candidateUrl == null) return -1;
		if (existingUrl == null) return 1;
		return candidateUrl < existingUrl ? 1 : -1;
	}
	return compareCheckTimes(candidate.node, existing.node);
}

function selectNewestCheck(records: GitLabCheckCandidate[]): PullRequestCheck {
	const newestPipeline = records.reduce(
		(id, { node }) => Math.max(id, node.runGroupId ?? 0),
		0,
	);
	const eligible = records.filter(
		({ node }) => node.runGroupId == null || node.runGroupId === newestPipeline,
	);
	// GitLab jobs and commit statuses share the CommitStatus ID sequence.
	const newestId = eligible.reduce(
		(id, { node }) => Math.max(id, node.databaseId ?? 0),
		0,
	);
	const identified = eligible.filter(
		({ node }) => node.databaseId === newestId,
	);
	const unidentified = eligible.filter(({ node }) => node.databaseId == null);
	const native = identified.reduce<GitLabCheckCandidate | null>(
		(existing, candidate) => {
			if (!existing) return candidate;
			const order =
				checkSnapshotTime(candidate.node) - checkSnapshotTime(existing.node) ||
				compareCheckTies(candidate, existing);
			return order > 0 ? candidate : existing;
		},
		null,
	);
	const candidates = native ? [native, ...unidentified] : unidentified;
	return candidates.reduce((existing, candidate) => {
		const order =
			compareCheckTimes(candidate.node, existing.node) ||
			compareCheckTies(candidate, existing);
		return order > 0 ? candidate : existing;
	}).check;
}

const jobTimestamp = z.iso
	.datetime({ offset: true })
	.refine((value) => Number.isFinite(Date.parse(value)));

function normalizedJobTimestamp(value: unknown) {
	const parsed = jobTimestamp.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export function normalizeGitLabChecks(
	nodes: CheckContextNode[],
): PullRequestCheck[] {
	const contexts = new Map<string, GitLabCheckCandidate[]>();
	const outcomes: Record<string, PullRequestCheck["status"]> = {
		SUCCESS: "success",
		FAILURE: "failure",
		ERROR: "failure",
		CANCELLED: "cancelled",
		SKIPPED: "skipped",
		NEUTRAL: "skipped",
	};
	for (const node of nodes) {
		if (!node) continue;
		const job = node.kind === "check";
		const name = job ? node.name : node.context;
		const outcome = job ? node.conclusion : node.state;
		const status =
			job && node.status !== "COMPLETED"
				? "pending"
				: (outcomes[outcome ?? ""] ?? "pending");
		const records = contexts.get(name) ?? [];
		records.push({
			check: {
				name,
				status,
				url: job ? node.detailsUrl : node.targetUrl,
				...(job
					? {
							startedAt: normalizedJobTimestamp(node.startedAt),
							completedAt: normalizedJobTimestamp(node.completedAt),
						}
					: {}),
			},
			node,
		});
		contexts.set(name, records);
	}
	return [...contexts.values()].map(selectNewestCheck);
}
