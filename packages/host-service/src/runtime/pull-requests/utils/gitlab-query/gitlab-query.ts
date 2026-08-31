import type { ExecGlab } from "../../../../trpc/router/workspace-creation/utils/exec-glab";
import type {
	GitHubCheckContextNode,
	GitHubPullRequestHeadRef,
	GitHubPullRequestNode,
	GitHubPullRequestReviewDecision,
} from "../github-query/types";

type PullRequestState = GitHubPullRequestNode["state"];
type Repository = { owner: string; name: string };

interface GitLabMergeRequest {
	iid?: number;
	title?: string;
	web_url?: string;
	state?: string;
	draft?: boolean;
	work_in_progress?: boolean;
	source_branch?: string;
	sha?: string;
	updated_at?: string;
	source_project_id?: number;
	target_project_id?: number;
}

interface GitLabCommitStatus {
	name?: string;
	status?: string;
	target_url?: string | null;
	created_at?: string | null;
	started_at?: string | null;
	finished_at?: string | null;
}

interface GitLabMergeRequestApprovals {
	approved?: boolean;
	approved_by?: unknown[];
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function projectApiPath(repository: Repository): string {
	return `projects/${encodeURIComponent(`${repository.owner}/${repository.name}`)}`;
}

function normalizePullRequestState(state: string): PullRequestState {
	if (state.toLowerCase() === "merged") return "MERGED";
	return state.toLowerCase() === "closed" ? "CLOSED" : "OPEN";
}

function normalizePullRequest(
	value: unknown,
	head: GitHubPullRequestHeadRef,
): GitHubPullRequestNode | null {
	if (!isRecord(value)) return null;
	const raw = value as GitLabMergeRequest;
	if (
		typeof raw.iid !== "number" ||
		typeof raw.title !== "string" ||
		typeof raw.web_url !== "string" ||
		typeof raw.state !== "string" ||
		typeof raw.source_branch !== "string" ||
		typeof raw.sha !== "string"
	) {
		return null;
	}

	return {
		number: raw.iid,
		title: raw.title,
		url: raw.web_url,
		state: normalizePullRequestState(raw.state),
		isDraft: raw.draft === true || raw.work_in_progress === true,
		headRefName: raw.source_branch,
		headRefOid: raw.sha,
		isCrossRepository: false,
		headRepositoryOwner: { login: head.owner },
		headRepository: { name: head.repo },
		updatedAt: raw.updated_at ?? new Date(0).toISOString(),
	};
}

function isSameProjectMergeRequest(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const raw = value as GitLabMergeRequest;
	return !(
		typeof raw.source_project_id === "number" &&
		typeof raw.target_project_id === "number" &&
		raw.source_project_id !== raw.target_project_id
	);
}

function normalizePullRequestCandidates(
	raw: unknown,
	head: GitHubPullRequestHeadRef,
): GitHubPullRequestNode | null {
	return (
		asArray(raw)
			.filter(isSameProjectMergeRequest)
			.map((item) => normalizePullRequest(item, head))
			.find((item) => item?.headRefName === head.branch) ?? null
	);
}

export async function fetchPullRequestByHeadFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	head: GitHubPullRequestHeadRef,
	cwd: string,
): Promise<GitHubPullRequestNode | null> {
	const raw = await execGlab(
		[
			"api",
			"--method",
			"GET",
			"--paginate",
			`${projectApiPath(repository)}/merge_requests`,
			"-f",
			"state=all",
			"-f",
			`source_branch=${head.branch}`,
			"-f",
			"order_by=updated_at",
			"-f",
			"sort=desc",
			"-f",
			"per_page=20",
		],
		{ cwd },
	);

	return normalizePullRequestCandidates(raw, head);
}

export async function fetchOpenPullRequestsFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	cwd: string,
): Promise<GitHubPullRequestNode[]> {
	const raw = await execGlab(
		[
			"api",
			"--method",
			"GET",
			"--paginate",
			`${projectApiPath(repository)}/merge_requests`,
			"-f",
			"state=opened",
			"-f",
			"order_by=updated_at",
			"-f",
			"sort=desc",
			"-f",
			"per_page=100",
		],
		{ cwd },
	);
	const head = { ...repository, repo: repository.name, branch: "" };
	return asArray(raw)
		.map((item) => {
			if (!isSameProjectMergeRequest(item)) return null;
			const mergeRequest = item as GitLabMergeRequest;
			const branch = mergeRequest.source_branch;
			return typeof branch === "string"
				? normalizePullRequest(item, { ...head, branch })
				: null;
		})
		.filter((item): item is GitHubPullRequestNode => item !== null);
}

function mapReviewDecision(
	raw: unknown,
	prState: PullRequestState,
): GitHubPullRequestReviewDecision {
	if (prState !== "OPEN") return null;
	if (!isRecord(raw)) return "REVIEW_REQUIRED";
	const approvals = raw as GitLabMergeRequestApprovals;
	return approvals.approved === true &&
		Array.isArray(approvals.approved_by) &&
		approvals.approved_by.length > 0
		? "APPROVED"
		: "REVIEW_REQUIRED";
}

export async function fetchPullRequestReviewDecisionFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	number: number,
	prState: PullRequestState,
	cwd: string,
): Promise<GitHubPullRequestReviewDecision> {
	const raw = await execGlab(
		[
			"api",
			"--method",
			"GET",
			`${projectApiPath(repository)}/merge_requests/${number}/approvals`,
		],
		{ cwd },
	);
	return mapReviewDecision(raw, prState);
}

function toCheckRunNode(status: GitLabCommitStatus): GitHubCheckContextNode {
	if (!status.name || !status.status) return null;
	const normalized = status.status.toLowerCase();
	const isPending = [
		"created",
		"pending",
		"preparing",
		"running",
		"scheduled",
		"waiting_for_resource",
	].includes(normalized);
	const conclusion = isPending
		? null
		: normalized === "success"
			? "SUCCESS"
			: normalized === "skipped" || normalized === "manual"
				? "SKIPPED"
				: normalized === "canceled"
					? "CANCELLED"
					: "FAILURE";
	return {
		__typename: "CheckRun",
		name: status.name,
		conclusion,
		detailsUrl: status.target_url ?? null,
		status: isPending ? "IN_PROGRESS" : "COMPLETED",
		startedAt: status.started_at ?? status.created_at ?? null,
		completedAt: status.finished_at ?? null,
		checkSuite: null,
	};
}

export async function fetchPullRequestChecksFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	headSha: string,
	cwd: string,
): Promise<GitHubCheckContextNode[]> {
	const raw = await execGlab(
		[
			"api",
			"--method",
			"GET",
			"--paginate",
			`${projectApiPath(repository)}/repository/commits/${headSha}/statuses`,
			"-f",
			"per_page=100",
		],
		{ cwd },
	);
	return asArray(raw)
		.map((item) => toCheckRunNode(item as GitLabCommitStatus))
		.filter(
			(item): item is NonNullable<GitHubCheckContextNode> => item !== null,
		);
}

export async function mergePullRequestFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	number: number,
	mergeMethod: "merge" | "squash" | "rebase",
	cwd: string,
	commitMessage?: string,
): Promise<void> {
	const args = [
		"mr",
		"merge",
		String(number),
		"--repo",
		`${repository.owner}/${repository.name}`,
		"--auto-merge=false",
		"--yes",
	];
	if (mergeMethod === "squash") args.push("--squash");
	if (mergeMethod === "rebase") args.push("--rebase");
	if (commitMessage) args.push("--message", commitMessage);
	await execGlab(args, { cwd, timeout: 60_000 });
}

export async function fetchJobLogsFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	jobId: number,
	cwd: string,
): Promise<string> {
	const logs = await execGlab(
		[
			"api",
			"--method",
			"GET",
			`${projectApiPath(repository)}/jobs/${jobId}/trace`,
		],
		{ cwd, timeout: 30_000, maxBuffer: 50 * 1024 * 1024 },
	);
	return typeof logs === "string" ? logs : String(logs);
}
