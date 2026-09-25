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

// GitHub stamps merged_at as ISO 8601 UTC (`2026-05-01T10:00:00Z`), optionally
// with fractional seconds.
const MERGED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

// GitHub's merged_at is the authoritative merge time. A non-null value means
// merged even when it fails to parse; the state keeps that meaning and only
// the timestamp is dropped.
//
// Date.parse alone is far looser than the format above and silently invents a
// merge time from a value GitHub never sent: it reads a missing zone marker as
// local time, so the same payload lands on a different instant per host, and it
// rolls impossible calendar dates forward, so `2026-02-31T10:00:00Z` would be
// stored as March 3. Pin the format, then require the parse to render back to
// the value we were given, which only a real calendar date does.
export function parseMergedAt(mergedAt: string | null): number | null {
	if (!mergedAt || !MERGED_AT.test(mergedAt)) return null;
	const parsed = Date.parse(mergedAt);
	if (Number.isNaN(parsed)) return null;
	return new Date(parsed).toISOString().startsWith(mergedAt.slice(0, 19))
		? parsed
		: null;
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
	const mergedAt = typeof raw.merged_at === "string" ? raw.merged_at : null;

	return {
		number: raw.number,
		title: raw.title,
		url: raw.html_url,
		state: normalizePullRequestState(raw.state, mergedAt),
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
		mergedAt: parseMergedAt(mergedAt),
	};
}

function headKey(
	owner: string | null | undefined,
	repo: string | null | undefined,
	branch: string,
): string | null {
	if (!owner || !repo) return null;
	// Exact match on the branch: this filters the results of a per-head query,
	// which GitHub already scopes case-sensitively server-side. Case drift is
	// recovered separately by the repo-wide open-PR sweep in the runtime.
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

// 100 full PR objects (bodies included) routinely exceed exec's stdout
// buffer, so project down to exactly what normalizePullRequest reads before
// the payload leaves gh. jq's null-indexing keeps absent nests as nulls,
// which normalizePullRequest already rejects the same way as missing keys.
const OPEN_PULL_REQUESTS_JQ =
	'if type == "array" then [.[] | select(type == "object") | {number, title, html_url, state, merged_at, draft, updated_at, head: {ref: .head.ref, sha: .head.sha, repo: {name: .head.repo.name, owner: {login: .head.repo.owner.login}}, user: {login: .head.user.login}}, base: {repo: {full_name: .base.repo.full_name}}}] else . end';

// GitHub's `head=` filter is case-sensitive on the branch (verified), so a
// drifted-case lookup returns nothing. This repo-wide sweep lets the caller
// match heads case-insensitively. Open PRs only — `state=all` is unbounded.
export async function fetchOpenPullRequestsFromGh(
	execGh: ExecGh,
	repository: {
		owner: string;
		name: string;
	},
): Promise<GitHubPullRequestNode[]> {
	const raw = await execGh([
		"api",
		"--method",
		"GET",
		`repos/${repository.owner}/${repository.name}/pulls`,
		"-f",
		"state=open",
		"-f",
		"sort=updated",
		"-f",
		"direction=desc",
		"-f",
		"per_page=100",
		"--jq",
		OPEN_PULL_REQUESTS_JQ,
	]);

	return asArray(raw)
		.map((item) => normalizePullRequest(item))
		.filter((node): node is GitHubPullRequestNode => node !== null);
}

export async function fetchOpenPullRequests(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
	},
): Promise<GitHubPullRequestNode[]> {
	const response = await octokit.rest.pulls.list({
		owner: repository.owner,
		repo: repository.name,
		state: "open",
		sort: "updated",
		direction: "desc",
		per_page: 100,
	});

	return response.data
		.map((item) => normalizePullRequest(item))
		.filter((node): node is GitHubPullRequestNode => node !== null);
}

// GitHub's REST PR payloads don't expose merge-queue membership, so detect it
// via GraphQL: a non-null `mergeQueueEntry` means the PR is sitting in the
// repo's merge queue waiting its turn. Repos without a queue simply return null.
const MERGE_QUEUE_ENTRY_QUERY =
	"query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){mergeQueueEntry{id}}}}";

function hasMergeQueueEntry(data: unknown): boolean {
	if (!isRecord(data)) return false;
	const repository = isRecord(data.repository) ? data.repository : null;
	const pullRequest =
		repository && isRecord(repository.pullRequest)
			? repository.pullRequest
			: null;
	return Boolean(pullRequest && isRecord(pullRequest.mergeQueueEntry));
}

export async function fetchPullRequestMergeQueueStateFromGh(
	execGh: ExecGh,
	repository: {
		owner: string;
		name: string;
	},
	number: number,
): Promise<boolean> {
	const raw = await execGh([
		"api",
		"graphql",
		"-f",
		`query=${MERGE_QUEUE_ENTRY_QUERY}`,
		"-f",
		`owner=${repository.owner}`,
		"-f",
		`name=${repository.name}`,
		"-F",
		`number=${number}`,
	]);

	// `gh api graphql` wraps the payload in `{ data: ... }`; Octokit unwraps it.
	const data = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
	return hasMergeQueueEntry(data);
}

export async function fetchPullRequestMergeQueueState(
	octokit: Octokit,
	repository: {
		owner: string;
		name: string;
	},
	number: number,
): Promise<boolean> {
	const data = await octokit.graphql(MERGE_QUEUE_ENTRY_QUERY, {
		owner: repository.owner,
		name: repository.name,
		number,
	});

	return hasMergeQueueEntry(data);
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
