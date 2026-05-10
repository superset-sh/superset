import type { Octokit } from "@octokit/rest";
import type { ExecGh } from "../../../../trpc/router/workspace-creation/utils/exec-gh";
import type {
	GitHubCheckContextNode,
	GitHubPullRequestHeadRef,
	GitHubPullRequestNode,
	GitHubPullRequestReviewDecision,
} from "./types";

type PullRequestState = GitHubPullRequestNode["state"];

interface RestReview {
	user?: {
		login?: string | null;
	} | null;
	state?: string | null;
	submitted_at?: string | null;
}

interface RestCheckRun {
	name?: string | null;
	conclusion?: string | null;
	details_url?: string | null;
	html_url?: string | null;
	status?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
}

interface RestCheckRunsResponse {
	check_runs?: RestCheckRun[];
}

interface RestCommitStatus {
	context?: string | null;
	state?: string | null;
	target_url?: string | null;
	created_at?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function normalizePullRequestState(
	state: string,
	mergedAt: string | null | undefined,
): PullRequestState {
	if (mergedAt) return "MERGED";
	return state.toLowerCase() === "closed" ? "CLOSED" : "OPEN";
}

function normalizePullRequest(raw: unknown): GitHubPullRequestNode | null {
	if (!isRecord(raw) || !isRecord(raw.head)) return null;
	const headRepo = isRecord(raw.head.repo) ? raw.head.repo : null;
	const headRepoOwner =
		headRepo && isRecord(headRepo.owner) ? headRepo.owner : null;
	const headUser = isRecord(raw.head.user) ? raw.head.user : null;
	const ownerLogin = headRepoOwner?.login ?? headUser?.login;

	if (
		typeof raw.number !== "number" ||
		typeof raw.title !== "string" ||
		typeof raw.html_url !== "string" ||
		typeof raw.state !== "string" ||
		typeof raw.head.ref !== "string" ||
		typeof raw.head.sha !== "string" ||
		typeof ownerLogin !== "string"
	) {
		return null;
	}

	const repoName =
		headRepo && typeof headRepo.name === "string" ? headRepo.name : null;
	const baseRepo =
		isRecord(raw.base) && isRecord(raw.base.repo) ? raw.base.repo : null;
	const baseFullName =
		baseRepo && typeof baseRepo.full_name === "string"
			? baseRepo.full_name.toLowerCase()
			: null;
	const headFullName = repoName
		? `${ownerLogin}/${repoName}`.toLowerCase()
		: null;

	return {
		number: raw.number,
		title: raw.title,
		url: raw.html_url,
		state: normalizePullRequestState(
			raw.state,
			typeof raw.merged_at === "string" ? raw.merged_at : null,
		),
		isDraft: raw.draft === true,
		headRefName: raw.head.ref,
		headRefOid: raw.head.sha,
		isCrossRepository:
			Boolean(baseFullName && headFullName) && baseFullName !== headFullName,
		headRepositoryOwner: { login: ownerLogin },
		headRepository: repoName ? { name: repoName } : null,
		updatedAt:
			typeof raw.updated_at === "string"
				? raw.updated_at
				: new Date(0).toISOString(),
	};
}

function headKey(
	owner: string | null | undefined,
	repo: string | null | undefined,
	branch: string,
): string | null {
	if (!owner || !repo) return null;
	// GitHub owner/repo names are case-insensitive; branch names are not.
	return `${owner.toLowerCase()}/${repo.toLowerCase()}#${branch}`;
}

function normalizePullRequestCandidates(
	raw: unknown,
	head: GitHubPullRequestHeadRef,
): GitHubPullRequestNode | null {
	const requestedKey = headKey(head.owner, head.repo, head.branch);
	return (
		asArray(raw)
			.map((item) => normalizePullRequest(item))
			.find(
				(node) =>
					node &&
					headKey(
						node.headRepositoryOwner?.login,
						node.headRepository?.name,
						node.headRefName,
					) === requestedKey,
			) ?? null
	);
}

function mapReviewDecision(
	rawReviews: unknown,
	prState: PullRequestState,
): GitHubPullRequestReviewDecision {
	const latestByAuthor = new Map<string, RestReview>();

	for (const item of asArray(rawReviews)) {
		if (!isRecord(item)) continue;
		const review = item as RestReview;
		const login = review.user?.login;
		const state = review.state;
		if (!login || !state || state === "COMMENTED" || state === "PENDING") {
			continue;
		}

		const existing = latestByAuthor.get(login);
		if (
			!existing ||
			Date.parse(review.submitted_at ?? "") >
				Date.parse(existing.submitted_at ?? "")
		) {
			latestByAuthor.set(login, review);
		}
	}

	let hasApproval = false;
	for (const review of latestByAuthor.values()) {
		if (review.state === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
		if (review.state === "APPROVED") hasApproval = true;
	}

	if (hasApproval) return "APPROVED";
	return prState === "OPEN" ? "REVIEW_REQUIRED" : null;
}

function toCheckRunNode(raw: RestCheckRun): GitHubCheckContextNode | null {
	if (!raw.name) return null;

	return {
		__typename: "CheckRun",
		name: raw.name,
		conclusion: raw.conclusion?.toUpperCase() ?? null,
		detailsUrl: raw.details_url ?? raw.html_url ?? null,
		status: raw.status?.toUpperCase() ?? "UNKNOWN",
		startedAt: raw.started_at ?? null,
		completedAt: raw.completed_at ?? null,
		checkSuite: null,
	};
}

function toStatusContextNode(
	raw: RestCommitStatus,
): GitHubCheckContextNode | null {
	if (!raw.context || !raw.state) return null;

	return {
		__typename: "StatusContext",
		context: raw.context,
		state: raw.state.toUpperCase(),
		targetUrl: raw.target_url ?? null,
		createdAt: raw.created_at ?? null,
	};
}

export async function fetchPullRequestByHeadFromGh(
	execGh: ExecGh,
	repository: {
		owner: string;
		name: string;
	},
	head: GitHubPullRequestHeadRef,
): Promise<GitHubPullRequestNode | null> {
	const raw = await execGh([
		"api",
		"--method",
		"GET",
		`repos/${repository.owner}/${repository.name}/pulls`,
		"-f",
		"state=all",
		"-f",
		`head=${head.owner}:${head.branch}`,
		"-f",
		"sort=updated",
		"-f",
		"direction=desc",
		"-f",
		"per_page=10",
	]);

	return normalizePullRequestCandidates(raw, head);
}

export async function fetchPullRequestByHead(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
	},
	head: GitHubPullRequestHeadRef,
): Promise<GitHubPullRequestNode | null> {
	const response = await octokit.rest.pulls.list({
		owner: repository.owner,
		repo: repository.name,
		state: "all",
		head: `${head.owner}:${head.branch}`,
		sort: "updated",
		direction: "desc",
		per_page: 10,
	});

	return normalizePullRequestCandidates(response.data, head);
}

export async function fetchPullRequestReviewDecisionFromGh(
	execGh: ExecGh,
	repository: {
		owner: string;
		name: string;
	},
	number: number,
	prState: PullRequestState,
): Promise<GitHubPullRequestReviewDecision> {
	const raw = await execGh([
		"api",
		"--method",
		"GET",
		`repos/${repository.owner}/${repository.name}/pulls/${number}/reviews`,
		"-f",
		"per_page=100",
	]);

	return mapReviewDecision(raw, prState);
}

export async function fetchPullRequestReviewDecision(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
	},
	number: number,
	prState: PullRequestState,
): Promise<GitHubPullRequestReviewDecision> {
	const response = await octokit.rest.pulls.listReviews({
		owner: repository.owner,
		repo: repository.name,
		pull_number: number,
		per_page: 100,
	});

	return mapReviewDecision(response.data, prState);
}

export async function fetchPullRequestChecksFromGh(
	execGh: ExecGh,
	repository: {
		owner: string;
		name: string;
	},
	headSha: string,
): Promise<GitHubCheckContextNode[]> {
	const [checkRunsRaw, statusesRaw] = await Promise.all([
		execGh([
			"api",
			"--method",
			"GET",
			`repos/${repository.owner}/${repository.name}/commits/${headSha}/check-runs`,
			"-f",
			"per_page=100",
		]),
		execGh([
			"api",
			"--method",
			"GET",
			`repos/${repository.owner}/${repository.name}/commits/${headSha}/statuses`,
			"-f",
			"per_page=100",
		]),
	]);
	const checkRuns = isRecord(checkRunsRaw)
		? asArray((checkRunsRaw as RestCheckRunsResponse).check_runs)
		: [];
	const statuses = asArray(statusesRaw);

	return [
		...checkRuns.map((item) => toCheckRunNode(item as RestCheckRun)),
		...statuses.map((item) => toStatusContextNode(item as RestCommitStatus)),
	].filter(
		(node): node is NonNullable<GitHubCheckContextNode> => node !== null,
	);
}

export async function fetchPullRequestChecks(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
	},
	headSha: string,
): Promise<GitHubCheckContextNode[]> {
	const [checkRunsResponse, statusesResponse] = await Promise.all([
		octokit.rest.checks.listForRef({
			owner: repository.owner,
			repo: repository.name,
			ref: headSha,
			per_page: 100,
		}),
		octokit.rest.repos.listCommitStatusesForRef({
			owner: repository.owner,
			repo: repository.name,
			ref: headSha,
			per_page: 100,
		}),
	]);

	return [
		...checkRunsResponse.data.check_runs.map((item) =>
			toCheckRunNode(item as RestCheckRun),
		),
		...statusesResponse.data.map((item) =>
			toStatusContextNode(item as RestCommitStatus),
		),
	].filter(
		(node): node is NonNullable<GitHubCheckContextNode> => node !== null,
	);
}
