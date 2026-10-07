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

export function mapMrToSummary(mr: GitLabMRSummary): PullRequestSummary {
	const state: PullRequestSummary["state"] =
		mr.state === "merged"
			? "merged"
			: mr.state === "closed"
				? "closed"
				: "open";

	return {
		prNumber: mr.iid,
		title: mr.title,
		url: mr.web_url,
		state,
		isDraft: mr.draft,
		authorLogin: mr.author?.username ?? null,
		updatedAt: mr.updated_at,
		checks: [],
		checksStatus: "none",
		headRefName: mr.source_branch,
		additions: null,
		deletions: null,
	};
}

export function mapIssueToSummary(issue: GitLabIssueSummary): IssueSummary {
	return {
		issueNumber: issue.iid,
		title: issue.title,
		url: issue.web_url,
		state: issue.state,
		authorLogin: issue.author?.username ?? null,
		updatedAt: issue.updated_at,
	};
}

const DIRECT_NUMBER_RE = /^#?\d+$/;

function parseDirectNumber(text: string): number | null {
	if (!DIRECT_NUMBER_RE.test(text.trim())) return null;
	const iid = Number(text.trim().replace(/^#/, ""));
	if (!Number.isSafeInteger(iid) || iid <= 0)
		throw new GitLabRestError(422, "Invalid GitLab issue or merge request IID");
	return iid;
}

function validatedFilteredMr(mr: GitLabMRSummary): GitLabMRSummary {
	if (
		!Number.isSafeInteger(mr?.iid) ||
		mr.iid <= 0 ||
		typeof mr.updated_at !== "string" ||
		!Number.isFinite(Date.parse(mr.updated_at))
	)
		throw new GitLabRestError(
			502,
			"Invalid GitLab filtered merge request identity or timestamp",
		);
	return mr;
}

export class GitLabSearchFilterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GitLabSearchFilterError";
	}
}

export function validateGitLabSearchAuthor(token: string): string {
	const username = token.trim().replace(/^@/, "");
	if (!/^[a-z\d_.-]{1,255}$/i.test(username))
		throw new GitLabSearchFilterError("Author must be a valid GitLab username");
	return token.trim() === "@me" ? "@me" : username;
}

const FILTER_CANDIDATE_LIMIT = 1000;
const FILTER_PAGE_LIMIT = 100;
const REVIEW_STATES = new Set([
	"unreviewed",
	"review_started",
	"reviewed",
	"approved",
	"requested_changes",
	"unapproved",
]);
const PENDING_REVIEW_STATES = new Set(["unreviewed", "review_started"]);
const COMPLETED_REVIEW_STATES = new Set([
	"reviewed",
	"approved",
	"requested_changes",
]);

function narrowSearch(): never {
	throw new GitLabSearchFilterError(
		"GitLab filtered search exceeds its scan limit. Narrow the search and try again.",
	);
}

async function filteredList<T>(
	deps: GitLabRestDeps,
	path: string,
	params: Record<string, string | number | boolean | undefined>,
	limit = FILTER_CANDIDATE_LIMIT,
	identity?: (item: T) => number,
): Promise<T[]> {
	const items: T[] = [];
	const distinct = new Map<number, T>();
	for (let page = 1, requests = 0; ; requests++) {
		if (requests >= FILTER_PAGE_LIMIT) narrowSearch();
		const result = await gitlabRestWithMeta<T[]>(deps, path, {
			...params,
			page,
			per_page: 100,
		});
		if (!Array.isArray(result.data))
			throw new GitLabRestError(502, "Invalid GitLab filtered list response");
		if (identity) {
			for (const item of result.data) distinct.set(identity(item), item);
			items.splice(0, items.length, ...distinct.values());
		} else items.push(...result.data);
		if (items.length > limit) narrowSearch();
		if (
			(result.nextPageKnown && result.nextPage === null) ||
			(!result.nextPageKnown && result.data.length < 100)
		)
			return items;
		const next = result.nextPageKnown ? result.nextPage : page + 1;
		if (next === null || !Number.isSafeInteger(next) || next <= page)
			throw new GitLabRestError(502, "Invalid GitLab filtered pagination");
		page = next;
	}
}

interface NativeReviewer {
	user: { username: string };
	state: string;
}
interface NativeApprovals {
	approved?: boolean;
	approved_by: { user: { username: string } }[];
}

async function approvalsFor(
	deps: GitLabRestDeps,
	path: string,
): Promise<NativeApprovals> {
	const facts = await gitlabRest<NativeApprovals>(deps, `${path}/approvals`);
	if (
		!Array.isArray(facts?.approved_by) ||
		facts.approved_by.some((entry) => typeof entry?.user?.username !== "string")
	)
		throw new GitLabSearchFilterError(
			"GitLab approval facts are unavailable for this search filter.",
		);
	return facts;
}

async function approvalRequirementsMet(
	deps: GitLabRestDeps,
	path: string,
): Promise<boolean> {
	let facts: { rules: { approved: boolean; approvals_required: number }[] };
	try {
		facts = await gitlabRest(deps, `${path}/approval_state`);
	} catch (error) {
		if (error instanceof GitLabRestError && error.status === 404)
			throw new GitLabSearchFilterError(
				"GitLab approval rules are unavailable for this search filter on this instance or edition.",
			);
		throw error;
	}
	if (
		!Array.isArray(facts?.rules) ||
		facts.rules.some(
			(rule) =>
				typeof rule?.approved !== "boolean" ||
				!Number.isSafeInteger(rule.approvals_required) ||
				rule.approvals_required < 0,
		)
	)
		throw new GitLabSearchFilterError(
			"GitLab approval rules are unavailable for this search filter.",
		);
	return facts.rules.every(
		(rule) => rule.approvals_required === 0 || rule.approved,
	);
}

async function matchesNativeReview(
	deps: GitLabRestDeps,
	path: string,
	review: NonNullable<PullRequestSearchFilters["gitlab"]>["review"],
	relationship: NonNullable<
		PullRequestSearchFilters["gitlab"]
	>["viewerRelationship"],
	viewer: string | undefined,
): Promise<boolean> {
	const reviewers = await filteredList<NativeReviewer>(
		deps,
		`${path}/reviewers`,
		{},
	);
	if (
		reviewers.some(
			(entry) =>
				typeof entry?.user?.username !== "string" ||
				!REVIEW_STATES.has(entry.state),
		)
	)
		throw new GitLabSearchFilterError(
			"GitLab returned an unknown review state for this search filter.",
		);
	const current = reviewers.find(
		(entry) => entry.user.username.toLowerCase() === viewer?.toLowerCase(),
	);
	const pending =
		current !== undefined && PENDING_REVIEW_STATES.has(current.state);
	if (relationship === "needs-review" || review === "review-requested")
		return pending;
	if (review === "changes-requested")
		return reviewers.some((entry) => entry.state === "requested_changes");
	if (
		review === "required" &&
		reviewers.some((entry) => PENDING_REVIEW_STATES.has(entry.state))
	)
		return true;
	if (review === "required")
		return !(await approvalRequirementsMet(deps, path));
	if (
		review === "reviewed-by-me" ||
		review === "not-reviewed-by-me" ||
		relationship === "reviewed"
	) {
		if (current) {
			const completed = COMPLETED_REVIEW_STATES.has(current.state);
			return review === "not-reviewed-by-me" ? !completed : completed;
		}
	}
	const approvals = await approvalsFor(deps, path);

	if (review === "approved") {
		if (typeof approvals.approved !== "boolean")
			throw new GitLabSearchFilterError(
				"GitLab approval verdict is unavailable for this search filter.",
			);
		return (
			approvals.approved &&
			approvals.approved_by.length > 0 &&
			!reviewers.some((entry) => entry.state === "requested_changes") &&
			(await approvalRequirementsMet(deps, path))
		);
	}

	if (review === "none")
		return (
			!reviewers.some((entry) => COMPLETED_REVIEW_STATES.has(entry.state)) &&
			approvals.approved_by.length === 0
		);
	const completed =
		!pending &&
		(current !== undefined
			? COMPLETED_REVIEW_STATES.has(current.state)
			: approvals.approved_by.some(
					(entry) =>
						entry.user.username.toLowerCase() === viewer?.toLowerCase(),
				));
	return review === "not-reviewed-by-me" ? !completed : completed;
}

async function searchFilteredPullRequestsGitLab(
	deps: GitLabRestDeps,
	repo: SearchRepoRef,
	filters: PullRequestSearchFilters,
): Promise<PullRequestsPage> {
	const native = filters.gitlab;
	if (!native)
		throw new GitLabSearchFilterError("Missing GitLab search filters");
	if (native.review === "team-review-requested")
		throw new GitLabSearchFilterError(
			"GitLab team review requests are not supported by this search filter.",
		);
	const authors = [
		...new Set((native.author ?? []).map(validateGitLabSearchAuthor)),
	];
	const needsViewer =
		authors.includes("@me") ||
		native.viewerRelationship !== undefined ||
		native.review === "reviewed-by-me" ||
		native.review === "not-reviewed-by-me" ||
		native.review === "review-requested";
	let viewer: string | undefined;
	if (needsViewer) {
		const user = await gitlabRest<{ username: string }>(deps, "/user");
		if (
			typeof user?.username !== "string" ||
			validateGitLabSearchAuthor(user.username) === "@me"
		)
			throw new GitLabSearchFilterError(
				"GitLab current-user facts are unavailable for this search filter.",
			);
		viewer = user.username;
	}
	const resolvedAuthors = [
		...new Map(
			(native.viewerRelationship === "authored"
				? [viewer ?? ""]
				: authors.map((author) => (author === "@me" ? (viewer ?? "") : author))
			).map((author) => [author.toLowerCase(), author]),
		).values(),
	];
	const review = native.review;
	const relationship =
		native.viewerRelationship === "authored"
			? undefined
			: native.viewerRelationship;
	const hasReview = review !== undefined || relationship !== undefined;
	const enc = encodeProjectPath(repo.owner, repo.name);
	const path = `/projects/${enc}/merge_requests`;
	const page = filters.page ?? 1;
	const limit = filters.limit ?? 30;
	const text = filters.text?.trim() ?? "";
	const direct = parseDirectNumber(text);
	let items: GitLabMRSummary[];
	if (direct !== null) {
		try {
			items = [
				validatedFilteredMr(
					await gitlabRest<GitLabMRSummary>(deps, `${path}/${direct}`),
				),
			];
		} catch (error) {
			if (error instanceof GitLabRestError && error.status === 404)
				return { pullRequests: [], totalCount: 0, hasNextPage: false, page };
			throw error;
		}
	} else {
		const params = {
			state: filters.mergedOnly
				? "merged"
				: filters.includeClosed
					? "all"
					: "opened",
			order_by: "updated_at",
			sort: "desc",
			search: text || undefined,
			author_username:
				resolvedAuthors.length === 1 ? resolvedAuthors[0] : undefined,
		};
		if (!hasReview && resolvedAuthors.length === 1) {
			const result = await gitlabRestWithMeta<GitLabMRSummary[]>(deps, path, {
				...params,
				page,
				per_page: limit,
			});
			if (!Array.isArray(result.data))
				throw new GitLabRestError(502, "Invalid GitLab filtered list response");
			if (result.total !== null) {
				if (
					result.nextPageKnown &&
					result.nextPage !== null &&
					(!Number.isSafeInteger(result.nextPage) || result.nextPage <= page)
				)
					throw new GitLabRestError(502, "Invalid GitLab filtered pagination");
				return {
					pullRequests: result.data
						.map(validatedFilteredMr)
						.map(mapMrToSummary),
					totalCount: result.total,
					hasNextPage: result.nextPageKnown
						? result.nextPage !== null
						: page * limit < result.total,
					page,
				};
			}
		}
		items = await filteredList<GitLabMRSummary>(
			deps,
			path,
			params,
			FILTER_CANDIDATE_LIMIT,
			(item) => validatedFilteredMr(item).iid,
		);
	}
	items = [...new Map(items.map((item) => [item.iid, item])).values()].filter(
		(item) =>
			(!filters.mergedOnly || item.state === "merged") &&
			(resolvedAuthors.length === 0 ||
				(typeof item.author?.username === "string" &&
					resolvedAuthors.some(
						(author) =>
							author.toLowerCase() === item.author?.username.toLowerCase(),
					))),
	);
	if (hasReview) {
		const matches: boolean[] = [];
		let index = 0;
		let failed = false;
		let failure: unknown;
		await Promise.all(
			Array.from({ length: Math.min(4, items.length) }, async () => {
				while (!failed && index < items.length) {
					const i = index++;
					const item = items[i];
					if (item) {
						try {
							matches[i] = await matchesNativeReview(
								deps,
								`${path}/${item.iid}`,
								review,
								relationship,
								viewer,
							);
						} catch (error) {
							if (!failed) failure = error;
							failed = true;
						}
					}
				}
			}),
		);
		if (failed) throw failure;
		items = items.filter((_, index) => matches[index]);
	}
	items.sort(
		(a, b) => b.updated_at.localeCompare(a.updated_at) || b.iid - a.iid,
	);
	const totalCount = items.length;
	return {
		pullRequests: (direct !== null
			? items
			: items.slice((page - 1) * limit, page * limit)
		).map(mapMrToSummary),
		totalCount,
		hasNextPage: direct === null && page * limit < totalCount,
		page,
	};
}

export async function searchPullRequestsGitLab(
	deps: GitLabRestDeps,
	repo: SearchRepoRef,
	filters: PullRequestSearchFilters,
): Promise<PullRequestsPage> {
	if (
		filters.gitlab &&
		(filters.gitlab.author ||
			filters.gitlab.review ||
			filters.gitlab.viewerRelationship)
	)
		return searchFilteredPullRequestsGitLab(deps, repo, filters);
	const enc = encodeProjectPath(repo.owner, repo.name);
	const perPage = filters.limit ?? 30;
	const page = filters.page ?? 1;
	const rawText = filters.text?.trim() ?? "";

	const directNumber = parseDirectNumber(rawText);
	if (directNumber !== null) {
		try {
			const mr = await gitlabRest<GitLabMRSummary>(
				deps,
				`/projects/${enc}/merge_requests/${directNumber}`,
			);
			const summary = mapMrToSummary(mr);
			if (filters.mergedOnly && summary.state !== "merged") {
				return { pullRequests: [], totalCount: 0, hasNextPage: false, page };
			}
			return {
				pullRequests: [summary],
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

	const params: Record<string, string | number | boolean | undefined> = {
		state: filters.mergedOnly
			? "merged"
			: filters.includeClosed
				? "all"
				: "opened",
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
		nextPage,
		nextPageKnown,
	} = await gitlabRestWithMeta<GitLabMRSummary[]>(
		deps,
		`/projects/${enc}/merge_requests`,
		params,
	);

	return {
		pullRequests: items.map(mapMrToSummary),
		totalCount: total ?? items.length,
		hasNextPage: nextPageKnown
			? nextPage !== null
			: totalPages !== null
				? page < totalPages
				: items.length === perPage,
		page,
	};
}

export async function searchIssuesGitLab(
	deps: GitLabRestDeps,
	repo: SearchRepoRef,
	filters: IssueSearchFilters,
): Promise<IssuesPage> {
	const enc = encodeProjectPath(repo.owner, repo.name);
	const perPage = filters.limit ?? 30;
	const page = filters.page ?? 1;
	const rawText = filters.text?.trim() ?? "";

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

	const params: Record<string, string | number | boolean | undefined> = {
		state: filters.includeClosed ? "all" : "opened",
		order_by: "updated_at",
		sort: "desc",
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
		nextPage,
		nextPageKnown,
	} = await gitlabRestWithMeta<GitLabIssueSummary[]>(
		deps,
		`/projects/${enc}/issues`,
		params,
	);

	return {
		issues: items.map(mapIssueToSummary),
		totalCount: total ?? items.length,
		hasNextPage: nextPageKnown
			? nextPage !== null
			: totalPages !== null
				? page < totalPages
				: items.length === perPage,
		page,
	};
}
