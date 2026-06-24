import type {
	IssueSearchFilters,
	IssueSummary,
	IssuesPage,
	PullRequestSearchFilters,
	PullRequestSummary,
	PullRequestsPage,
	SearchRepoRef,
} from "../types";
import {
	encodeProjectPath,
	type GitLabRestDeps,
	GitLabRestError,
	gitlabRest,
	gitlabRestWithMeta,
} from "./gitlab-rest";

// ---------------------------------------------------------------------------
// Raw GitLab shapes for search (subset of full MR/issue objects)
// ---------------------------------------------------------------------------

interface GitLabMRSummary {
	iid: number;
	title: string;
	web_url: string;
	state: "opened" | "closed" | "merged" | "locked";
	draft: boolean;
	description: string;
	source_branch: string;
	sha: string;
	author?: { username: string } | null;
	created_at: string;
	updated_at: string;
	target_branch: string;
	source_project_id: number;
	target_project_id: number;
}

interface GitLabIssueSummary {
	iid: number;
	title: string;
	web_url: string;
	state: string;
	description: string;
	author?: { username: string } | null;
	created_at: string;
	updated_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Map a GitLab MR list/detail object to a PullRequestSummary. */
export function mapMrToSummary(mr: GitLabMRSummary): PullRequestSummary {
	const state: PullRequestSummary["state"] =
		mr.state === "merged"
			? "merged"
			: mr.state === "closed"
				? "closed"
				: "open"; // opened | locked → open

	return {
		prNumber: mr.iid,
		title: mr.title,
		url: mr.web_url,
		state,
		isDraft: mr.draft,
		authorLogin: mr.author?.username ?? null,
	};
}

/** Map a GitLab issue list/detail object to an IssueSummary. */
export function mapIssueToSummary(issue: GitLabIssueSummary): IssueSummary {
	return {
		issueNumber: issue.iid,
		title: issue.title,
		url: issue.web_url,
		state: issue.state, // pass through lowercase as-is (GitLab returns "opened"|"closed")
		authorLogin: issue.author?.username ?? null,
	};
}

// ---------------------------------------------------------------------------
// Helper: detect bare-number direct lookup (e.g. "42" or "#42")
// ---------------------------------------------------------------------------

const DIRECT_NUMBER_RE = /^#?\d+$/;

function parseDirectNumber(text: string): number | null {
	if (!DIRECT_NUMBER_RE.test(text.trim())) return null;
	return Number.parseInt(text.replace(/^#/, ""), 10);
}

// ---------------------------------------------------------------------------
// searchPullRequestsGitLab
// ---------------------------------------------------------------------------

/**
 * Search GitLab merge requests via the REST API.
 *
 * Uses `X-Total` / `X-Total-Pages` response headers (via `gitlabRestWithMeta`)
 * to compute accurate pagination. Falls back to the `items.length === per_page`
 * approximation when the headers are absent (e.g. some self-managed instances
 * disable them for performance).
 */
export async function searchPullRequestsGitLab(
	deps: GitLabRestDeps,
	repo: SearchRepoRef,
	filters: PullRequestSearchFilters,
): Promise<PullRequestsPage> {
	const enc = encodeProjectPath(repo.owner, repo.name);
	const perPage = filters.limit ?? 30;
	const page = filters.page ?? 1;
	const rawText = filters.text?.trim() ?? "";

	// Direct number lookup: GET /merge_requests/:iid
	const directNumber = parseDirectNumber(rawText);
	if (directNumber !== null) {
		try {
			const mr = await gitlabRest<GitLabMRSummary>(
				deps,
				`/projects/${enc}/merge_requests/${directNumber}`,
			);
			return {
				pullRequests: [mapMrToSummary(mr)],
				totalCount: 1,
				hasNextPage: false,
				page,
			};
		} catch (err) {
			if (err instanceof GitLabRestError && err.status === 404) {
				return { pullRequests: [], totalCount: 0, hasNextPage: false, page };
			}
			throw err;
		}
	}

	// List search — use the meta variant to read X-Total / X-Total-Pages headers.
	const params: Record<string, string | number | boolean | undefined> = {
		state: filters.includeClosed ? "all" : "opened",
		per_page: perPage,
		page,
		order_by: "updated_at",
		sort: "desc",
	};
	if (rawText) {
		params.search = rawText;
	}

	const {
		data: items,
		total,
		totalPages,
	} = await gitlabRestWithMeta<GitLabMRSummary[]>(
		deps,
		`/projects/${enc}/merge_requests`,
		params,
	);

	return {
		pullRequests: items.map(mapMrToSummary),
		totalCount: total ?? items.length,
		hasNextPage:
			totalPages !== null ? page < totalPages : items.length === perPage,
		page,
	};
}

// ---------------------------------------------------------------------------
// searchIssuesGitLab
// ---------------------------------------------------------------------------

/**
 * Search GitLab issues via the REST API.
 *
 * NOTE: The GitLab issues REST API shape is DOCUMENTED but not live-validated
 * against a real instance. Mark for live validation before production rollout.
 *
 * Uses `X-Total` / `X-Total-Pages` headers for accurate pagination (same as
 * searchPullRequestsGitLab). Falls back to `items.length === per_page` when
 * headers are absent.
 */
export async function searchIssuesGitLab(
	deps: GitLabRestDeps,
	repo: SearchRepoRef,
	filters: IssueSearchFilters,
): Promise<IssuesPage> {
	const enc = encodeProjectPath(repo.owner, repo.name);
	const perPage = filters.limit ?? 30;
	const page = filters.page ?? 1;
	const rawText = filters.text?.trim() ?? "";

	// Direct number lookup: GET /issues/:iid
	const directNumber = parseDirectNumber(rawText);
	if (directNumber !== null) {
		try {
			const issue = await gitlabRest<GitLabIssueSummary>(
				deps,
				`/projects/${enc}/issues/${directNumber}`,
			);
			return {
				issues: [mapIssueToSummary(issue)],
				totalCount: 1,
				hasNextPage: false,
				page,
			};
		} catch (err) {
			if (err instanceof GitLabRestError && err.status === 404) {
				return { issues: [], totalCount: 0, hasNextPage: false, page };
			}
			throw err;
		}
	}

	// List search — use the meta variant to read X-Total / X-Total-Pages headers.
	const params: Record<string, string | number | boolean | undefined> = {
		state: filters.includeClosed ? "all" : "opened",
		per_page: perPage,
		page,
	};
	if (rawText) {
		params.search = rawText;
	}

	const {
		data: items,
		total,
		totalPages,
	} = await gitlabRestWithMeta<GitLabIssueSummary[]>(
		deps,
		`/projects/${enc}/issues`,
		params,
	);

	return {
		issues: items.map(mapIssueToSummary),
		totalCount: total ?? items.length,
		hasNextPage:
			totalPages !== null ? page < totalPages : items.length === perPage,
		page,
	};
}
