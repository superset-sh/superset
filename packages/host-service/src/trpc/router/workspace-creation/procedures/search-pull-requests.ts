import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import { z } from "zod";
import {
	fetchPullRequestChecks,
	fetchPullRequestReviewDecision,
	type GitHubPullRequestReviewDecision,
} from "../../../../runtime/pull-requests/utils/github-query";
import type {
	ChecksStatus,
	PullRequestCheck,
} from "../../../../runtime/pull-requests/utils/pull-request-mappers";
import { protectedProcedure } from "../../../index";
import {
	normalizePullRequestChecks,
	pullRequestCheckContextSchema,
} from "../../pull-requests/pull-request-checks";
import { normalizeGitHubQuery } from "../normalize-github-query";
import { githubSearchInputSchema } from "../schemas";
import {
	buildSearchQuery,
	chunkProjectRepos,
	formatRepoList,
	githubRateLimitError,
	isGithubNotFoundError,
	isGithubRateLimitError,
	mergeByUpdatedAtDesc,
	type ProjectRepo,
	projectIdForSearchItem,
	resolveProjectRepos,
} from "../shared/github-search";
import {
	type ResolvedGithubRepo,
	resolveGithubRepo,
} from "../shared/project-helpers";
import type { ExecGh } from "../utils/exec-gh";

interface PullRequestResult {
	projectId: string;
	prNumber: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	updatedAt: string | null;
	checks: PullRequestCheck[];
	checksStatus: ChecksStatus;
	additions: number;
	deletions: number;
	baseRefName: string | null;
}

export interface PullRequestsPage {
	pullRequests: PullRequestResult[];
	totalCount: number;
	hasNextPage: boolean;
	page: number;
	repoMismatch?: string;
}

const githubAuthorSchema = z
	.string()
	.trim()
	.regex(
		/^@?(?!.*--)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?:\[bot\])?$/i,
		"Author must be a valid GitHub username",
	)
	.transform((author) => author.replace(/^@/, ""));

const pullRequestReviewFilterSchema = z.enum([
	"none",
	"required",
	"approved",
	"changes-requested",
	"reviewed-by-me",
	"not-reviewed-by-me",
	"review-requested",
	"team-review-requested",
]);

type PullRequestReviewFilter = z.infer<typeof pullRequestReviewFilterSchema>;

const REVIEW_QUERY_BY_FILTER: Record<PullRequestReviewFilter, string> = {
	none: "review:none",
	required: "review:required",
	approved: "review:approved",
	"changes-requested": "review:changes_requested",
	"reviewed-by-me": "reviewed-by:@me",
	"not-reviewed-by-me": "-reviewed-by:@me",
	"review-requested": "user-review-requested:@me",
	"team-review-requested": "review-requested:@me",
};

const REVIEW_DECISION_BY_FILTER: Record<
	"required" | "approved" | "changes-requested",
	NonNullable<GitHubPullRequestReviewDecision>
> = {
	required: "REVIEW_REQUIRED",
	approved: "APPROVED",
	"changes-requested": "CHANGES_REQUESTED",
};

// GitHub caps Search API results at 1000; paging past that returns 422.
const GITHUB_SEARCH_RESULT_LIMIT = 1_000;

const searchPullRequestsInputSchema = githubSearchInputSchema.extend({
	author: githubAuthorSchema.optional(),
	review: pullRequestReviewFilterSchema.optional(),
});

function emptyPullRequestsPage(page: number): PullRequestsPage {
	return {
		pullRequests: [],
		totalCount: 0,
		hasNextPage: false,
		page,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function matchesAuthor(
	authorLogin: string | null,
	authorFilter: string | undefined,
): boolean {
	return (
		!authorFilter || authorLogin?.toLowerCase() === authorFilter.toLowerCase()
	);
}

function normalizePullRequestState(
	state: string,
	mergedAt: string | null | undefined,
): "open" | "closed" | "merged" {
	if (mergedAt) return "merged";
	return state.toLowerCase() === "closed" ? "closed" : "open";
}

const GRAPHQL_PR_STATE: Record<
	"open" | "closed" | "merged",
	"OPEN" | "CLOSED" | "MERGED"
> = {
	open: "OPEN",
	closed: "CLOSED",
	merged: "MERGED",
};

// User requests carry `login`; team requests carry `slug`/`name` instead.
const ghReviewRequestSchema = z.object({
	login: z.string().optional(),
	slug: z.string().optional(),
	name: z.string().optional(),
});

const ghLatestReviewSchema = z.object({
	author: z.object({ login: z.string() }).nullable().optional(),
	state: z.string().optional(),
});

const ghPrViewSchema = z.object({
	number: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
	isDraft: z.boolean().optional(),
	author: z.object({ login: z.string() }).nullable().optional(),
	mergedAt: z.string().nullable().optional(),
	updatedAt: z.string().nullable().optional(),
	statusCheckRollup: z
		.array(pullRequestCheckContextSchema)
		.nullable()
		.optional(),
	reviewDecision: z.string().nullable().optional(),
	reviewRequests: z.array(ghReviewRequestSchema).nullable().optional(),
	latestReviews: z.array(ghLatestReviewSchema).nullable().optional(),
	additions: z.number().optional(),
	deletions: z.number().optional(),
	baseRefName: z.string().optional(),
});

const PR_VIEW_FIELDS =
	"number,title,url,state,isDraft,author,mergedAt,updatedAt,statusCheckRollup,reviewDecision,reviewRequests,latestReviews,additions,deletions,baseRefName";

interface GhDirectLookupReview {
	decision: string | null;
	requests: z.infer<typeof ghReviewRequestSchema>[];
	latestReviews: z.infer<typeof ghLatestReviewSchema>[];
}

async function ghDirectLookup(
	execGh: ExecGh,
	target: ProjectRepo,
	prNumber: number,
): Promise<{ pullRequest: PullRequestResult; review: GhDirectLookupReview }> {
	const { repo } = target;
	const raw = await execGh(
		[
			"pr",
			"view",
			String(prNumber),
			"--repo",
			`${repo.owner}/${repo.name}`,
			"--json",
			PR_VIEW_FIELDS,
		],
		{ cwd: repo.repoPath ?? undefined },
	);
	const pr = ghPrViewSchema.parse(raw);
	const { checks, checksStatus } = normalizePullRequestChecks(
		pr.statusCheckRollup,
	);
	return {
		pullRequest: {
			projectId: target.projectId,
			prNumber: pr.number,
			title: pr.title,
			url: pr.url,
			state: normalizePullRequestState(pr.state, pr.mergedAt),
			isDraft: pr.isDraft ?? false,
			authorLogin: pr.author?.login ?? null,
			updatedAt: pr.updatedAt ?? null,
			checks,
			checksStatus,
			additions: pr.additions ?? 0,
			deletions: pr.deletions ?? 0,
			baseRefName: pr.baseRefName ?? null,
		},
		review: {
			decision: pr.reviewDecision || null,
			requests: pr.reviewRequests ?? [],
			latestReviews: pr.latestReviews ?? [],
		},
	};
}

const ghViewerSchema = z.object({ login: z.string() });

async function ghIsViewerTeamMember(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	teamSlug: string,
	viewerLogin: string,
): Promise<boolean> {
	try {
		const raw = await execGh(
			[
				"api",
				`orgs/${repo.owner}/teams/${teamSlug}/memberships/${viewerLogin}`,
			],
			{ cwd: repo.repoPath ?? undefined },
		);
		return isRecord(raw) && raw.state === "active";
	} catch {
		// 404 (not a member) or no org read access — fail safe as no match.
		return false;
	}
}

async function ghDirectLookupMatchesReviewFilter(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	review: GhDirectLookupReview,
	filter: PullRequestReviewFilter,
): Promise<boolean> {
	if (filter === "none") return !review.decision;
	if (
		filter === "required" ||
		filter === "approved" ||
		filter === "changes-requested"
	) {
		return review.decision === REVIEW_DECISION_BY_FILTER[filter];
	}
	const viewerRaw = await execGh(["api", "user"], {
		cwd: repo.repoPath ?? undefined,
	});
	const viewerLogin = ghViewerSchema.parse(viewerRaw).login.toLowerCase();
	const reviewedByViewer = review.latestReviews.some(
		(latestReview) => latestReview.author?.login.toLowerCase() === viewerLogin,
	);
	if (filter === "reviewed-by-me") return reviewedByViewer;
	if (filter === "not-reviewed-by-me") return !reviewedByViewer;
	const viewerRequested = review.requests.some(
		(request) => request.login?.toLowerCase() === viewerLogin,
	);
	if (filter === "review-requested") return viewerRequested;
	if (viewerRequested) return true;
	for (const request of review.requests) {
		const teamSlug = request.login ? null : (request.slug ?? request.name);
		if (!teamSlug) continue;
		if (await ghIsViewerTeamMember(execGh, repo, teamSlug, viewerLogin)) {
			return true;
		}
	}
	return false;
}

/**
 * Direct-lookup a PR in one repo and apply the author/review filters.
 * Returns null when the PR exists but doesn't match the filters.
 */
async function ghDirectLookupRow(
	execGh: ExecGh,
	target: ProjectRepo,
	prNumber: number,
	author: string | undefined,
	reviewFilter: PullRequestReviewFilter | undefined,
): Promise<PullRequestResult | null> {
	const { pullRequest, review } = await ghDirectLookup(
		execGh,
		target,
		prNumber,
	);
	if (!matchesAuthor(pullRequest.authorLogin, author)) return null;
	if (
		reviewFilter &&
		!(await ghDirectLookupMatchesReviewFilter(
			execGh,
			target.repo,
			review,
			reviewFilter,
		))
	) {
		return null;
	}
	return pullRequest;
}

type OctokitPullRequest =
	RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];

async function octokitIsViewerTeamMember(
	octokit: Octokit,
	org: string,
	teamSlug: string,
	username: string,
): Promise<boolean> {
	try {
		const { data } = await octokit.teams.getMembershipForUserInOrg({
			org,
			team_slug: teamSlug,
			username,
		});
		return data.state === "active";
	} catch {
		// 404 (not a member) or no org read access — fail safe as no match.
		return false;
	}
}

async function octokitDirectLookupMatchesReviewFilter(
	octokit: Octokit,
	repo: ResolvedGithubRepo,
	pr: OctokitPullRequest,
	filter: PullRequestReviewFilter,
): Promise<boolean> {
	if (
		filter === "none" ||
		filter === "required" ||
		filter === "approved" ||
		filter === "changes-requested"
	) {
		// REST has no reviewDecision; the shared helper approximates it from
		// the reviews list (open + unreviewed ⇒ REVIEW_REQUIRED, so "none"
		// only matches closed/merged unreviewed PRs).
		const decision = await fetchPullRequestReviewDecision(
			octokit,
			{ owner: repo.owner, name: repo.name },
			pr.number,
			GRAPHQL_PR_STATE[normalizePullRequestState(pr.state, pr.merged_at)],
		);
		if (filter === "none") return decision === null;
		return decision === REVIEW_DECISION_BY_FILTER[filter];
	}
	const { data: viewer } = await octokit.users.getAuthenticated();
	const viewerLogin = viewer.login.toLowerCase();
	if (filter === "reviewed-by-me" || filter === "not-reviewed-by-me") {
		const { data: reviews } = await octokit.rest.pulls.listReviews({
			owner: repo.owner,
			repo: repo.name,
			pull_number: pr.number,
			per_page: 100,
		});
		const reviewedByViewer = reviews.some(
			(review) =>
				review.state !== "PENDING" &&
				review.user?.login.toLowerCase() === viewerLogin,
		);
		return filter === "reviewed-by-me" ? reviewedByViewer : !reviewedByViewer;
	}
	const viewerRequested = (pr.requested_reviewers ?? []).some(
		(reviewer) => reviewer.login.toLowerCase() === viewerLogin,
	);
	if (filter === "review-requested") return viewerRequested;
	if (viewerRequested) return true;
	for (const team of pr.requested_teams ?? []) {
		if (
			await octokitIsViewerTeamMember(
				octokit,
				repo.owner,
				team.slug,
				viewer.login,
			)
		) {
			return true;
		}
	}
	return false;
}

/**
 * Octokit twin of {@link ghDirectLookupRow}: direct-lookup one repo, apply
 * author/review filters, enrich checks best-effort. Null = filtered out or
 * PR not found/inaccessible.
 */
async function octokitDirectLookupRow(
	octokit: Octokit,
	target: ProjectRepo,
	prNumber: number,
	author: string | undefined,
	reviewFilter: PullRequestReviewFilter | undefined,
): Promise<PullRequestResult | null> {
	const { repo } = target;
	const response = await octokit.pulls
		.get({
			owner: repo.owner,
			repo: repo.name,
			pull_number: prNumber,
		})
		.catch((error: unknown) => {
			// A 404 means the PR doesn't exist or isn't accessible to the user —
			// an expected empty result, not an internal error.
			if (isGithubNotFoundError(error)) return null;
			throw error;
		});
	if (!response) return null;
	const pr = response.data;
	if (!matchesAuthor(pr.user?.login ?? null, author)) return null;
	if (
		reviewFilter &&
		!(await octokitDirectLookupMatchesReviewFilter(
			octokit,
			repo,
			pr,
			reviewFilter,
		))
	) {
		return null;
	}
	const state = normalizePullRequestState(pr.state, pr.merged_at);
	let checks: PullRequestCheck[] = [];
	let checksStatus: ChecksStatus = "none";
	try {
		const contexts = await fetchPullRequestChecks(
			octokit,
			{ owner: repo.owner, name: repo.name },
			pr.head.sha,
		);
		({ checks, checksStatus } = normalizePullRequestChecks(contexts));
	} catch (checksError) {
		console.warn(
			"[workspaceCreation.searchPullRequests] failed to enrich checks via Octokit",
			checksError,
		);
	}
	return {
		projectId: target.projectId,
		prNumber: pr.number,
		title: pr.title,
		url: pr.html_url,
		state,
		isDraft: pr.draft ?? false,
		authorLogin: pr.user?.login ?? null,
		updatedAt: pr.updated_at ?? null,
		checks,
		checksStatus,
		additions: pr.additions ?? 0,
		deletions: pr.deletions ?? 0,
		baseRefName: pr.base?.ref ?? null,
	};
}

const searchIssuesItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	html_url: z.string(),
	state: z.string(),
	draft: z.boolean().optional(),
	user: z.object({ login: z.string() }).nullable().optional(),
	pull_request: z
		.object({
			merged_at: z.string().nullable().optional(),
		})
		.optional(),
	updated_at: z.string().optional(),
	repository_url: z.string().optional(),
});

const searchIssuesResponseSchema = z.object({
	total_count: z.number(),
	items: z.array(searchIssuesItemSchema),
});

async function ghApiSearchPullRequests(
	execGh: ExecGh,
	chunk: ProjectRepo[],
	qualifiers: string,
	page: number,
	perPage: number,
): Promise<{
	items: PullRequestResult[];
	totalCount: number;
	hasNextPage: boolean;
}> {
	const q = buildSearchQuery(chunk, qualifiers);
	const args = [
		"api",
		"-X",
		"GET",
		"search/issues",
		"-f",
		`q=${q}`,
		"-F",
		`per_page=${perPage}`,
		"-F",
		`page=${page}`,
		"-f",
		"sort=updated",
		"-f",
		"order=desc",
	];
	const raw = await execGh(args, { cwd: chunk[0]?.repo.repoPath });
	const parsed = searchIssuesResponseSchema.parse(raw);
	const items: PullRequestResult[] = parsed.items
		.filter((item) => !!item.pull_request)
		.flatMap((item): PullRequestResult[] => {
			const projectId = projectIdForSearchItem(chunk, item.repository_url);
			if (!projectId) return [];
			return [
				{
					projectId,
					prNumber: item.number,
					title: item.title,
					url: item.html_url,
					state: normalizePullRequestState(
						item.state,
						item.pull_request?.merged_at,
					),
					isDraft: item.draft ?? false,
					authorLogin: item.user?.login ?? null,
					updatedAt: item.updated_at ?? null,
					checks: [],
					checksStatus: "none",
					additions: 0,
					deletions: 0,
					baseRefName: null,
				},
			];
		});
	const hasNextPage =
		page * perPage < Math.min(parsed.total_count, GITHUB_SEARCH_RESULT_LIMIT);
	return { items, totalCount: parsed.total_count, hasNextPage };
}

async function octokitSearchPullRequests(
	octokit: Octokit,
	chunk: ProjectRepo[],
	qualifiers: string,
	page: number,
	perPage: number,
): Promise<{
	items: PullRequestResult[];
	totalCount: number;
	hasNextPage: boolean;
}> {
	const { data } = await octokit.search.issuesAndPullRequests({
		q: buildSearchQuery(chunk, qualifiers),
		per_page: perPage,
		page,
		sort: "updated",
		order: "desc",
	});
	const items: PullRequestResult[] = data.items
		.filter((item) => item.pull_request)
		.flatMap((item): PullRequestResult[] => {
			const projectId = projectIdForSearchItem(chunk, item.repository_url);
			if (!projectId) return [];
			return [
				{
					projectId,
					prNumber: item.number,
					title: item.title,
					url: item.html_url,
					state: normalizePullRequestState(
						item.state,
						item.pull_request?.merged_at,
					),
					isDraft: item.draft ?? false,
					authorLogin: item.user?.login ?? null,
					updatedAt: item.updated_at ?? null,
					checks: [],
					checksStatus: "none",
					additions: 0,
					deletions: 0,
					baseRefName: null,
				},
			];
		});
	const hasNextPage =
		page * perPage < Math.min(data.total_count, GITHUB_SEARCH_RESULT_LIMIT);
	return { items, totalCount: data.total_count, hasNextPage };
}

const checksGraphqlDataSchema = z.object({
	repository: z
		.record(
			z.string(),
			z
				.object({
					number: z.number(),
					additions: z.number().optional(),
					deletions: z.number().optional(),
					baseRefName: z.string().nullable().optional(),
					statusCheckRollup: z
						.object({
							contexts: z.object({
								nodes: z.array(pullRequestCheckContextSchema.nullable()),
								pageInfo: z.object({
									hasNextPage: z.boolean(),
									endCursor: z.string().nullable(),
								}),
							}),
						})
						.nullable()
						.optional(),
				})
				.nullable(),
		)
		.nullable(),
});

type RunChecksGraphqlQuery = (
	query: string,
	variables: Record<string, string>,
) => Promise<unknown>;

type PullRequestEnrichment = Pick<
	PullRequestResult,
	"checks" | "checksStatus" | "additions" | "deletions" | "baseRefName"
>;

async function getPullRequestChecksViaGraphql(
	runQuery: RunChecksGraphqlQuery,
	repo: { owner: string; name: string },
	pullRequestNumbers: number[],
): Promise<Map<number, PullRequestEnrichment>> {
	if (pullRequestNumbers.length === 0) return new Map();
	const contextsByPullRequest = new Map<
		number,
		z.infer<typeof pullRequestCheckContextSchema>[]
	>();
	const metaByPullRequest = new Map<
		number,
		{ additions: number; deletions: number; baseRefName: string | null }
	>();
	let cursors = new Map<number, string | null>(
		pullRequestNumbers.map((number) => [number, null]),
	);

	while (cursors.size > 0) {
		const cursorDefinitions = [...cursors]
			.flatMap(([number, cursor]) =>
				cursor ? [`$cursor${number}: String!`] : [],
			)
			.join(", ");
		const selections = [...cursors]
			.map(
				([number, cursor]) => `pr${number}:pullRequest(number:${number}) {
				number
				additions
				deletions
				baseRefName
				statusCheckRollup {
					contexts(first: 100${cursor ? `, after: $cursor${number}` : ""}) {
						pageInfo { hasNextPage endCursor }
						nodes {
							__typename
							... on CheckRun {
								name
								status
								conclusion
								detailsUrl
								startedAt
								completedAt
							}
							... on StatusContext {
								context
								state
								targetUrl
								createdAt
							}
						}
					}
				}
			}`,
			)
			.join("\n");
		const query = `query($owner: String!, $name: String!${cursorDefinitions ? `, ${cursorDefinitions}` : ""}) {
		repository(owner: $owner, name: $name) {
			${selections}
		}
	}`;
		const variables: Record<string, string> = {
			owner: repo.owner,
			name: repo.name,
		};
		for (const [number, cursor] of cursors) {
			if (cursor) variables[`cursor${number}`] = cursor;
		}
		const raw = await runQuery(query, variables);
		// `gh api graphql` returns the full `{ data: ... }` envelope;
		// octokit.graphql resolves to the inner data object.
		const data = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
		const repository = checksGraphqlDataSchema.parse(data).repository;
		if (!repository) return new Map();

		const nextCursors = new Map<number, string | null>();
		for (const pullRequest of Object.values(repository)) {
			if (!pullRequest) continue;
			metaByPullRequest.set(pullRequest.number, {
				additions: pullRequest.additions ?? 0,
				deletions: pullRequest.deletions ?? 0,
				baseRefName: pullRequest.baseRefName ?? null,
			});
			const contexts =
				pullRequest.statusCheckRollup?.contexts.nodes.filter(
					(context): context is z.infer<typeof pullRequestCheckContextSchema> =>
						context !== null,
				) ?? [];
			const existing = contextsByPullRequest.get(pullRequest.number) ?? [];
			contextsByPullRequest.set(pullRequest.number, [...existing, ...contexts]);
			const pageInfo = pullRequest.statusCheckRollup?.contexts.pageInfo;
			if (pageInfo?.hasNextPage) {
				if (!pageInfo.endCursor) {
					throw new Error(
						`Missing check-rollup cursor for PR #${pullRequest.number}`,
					);
				}
				if (pageInfo.endCursor === cursors.get(pullRequest.number)) {
					throw new Error(
						`Check-rollup cursor did not advance for PR #${pullRequest.number}`,
					);
				}
				nextCursors.set(pullRequest.number, pageInfo.endCursor);
			}
		}
		cursors = nextCursors;
	}

	return new Map(
		pullRequestNumbers.map((pullRequestNumber) => {
			const contexts = contextsByPullRequest.get(pullRequestNumber) ?? [];
			const { checks, checksStatus } = normalizePullRequestChecks(contexts);
			const meta = metaByPullRequest.get(pullRequestNumber) ?? {
				additions: 0,
				deletions: 0,
				baseRefName: null,
			};
			return [pullRequestNumber, { checks, checksStatus, ...meta }] as const;
		}),
	);
}

async function ghGetPullRequestChecks(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	pullRequestNumbers: number[],
): Promise<Map<number, PullRequestEnrichment>> {
	return getPullRequestChecksViaGraphql(
		(query, variables) =>
			execGh(
				[
					"api",
					"graphql",
					"-f",
					`query=${query}`,
					...Object.entries(variables).flatMap(([key, value]) => [
						"-f",
						`${key}=${value}`,
					]),
				],
				{ cwd: repo.repoPath ?? undefined },
			),
		repo,
		pullRequestNumbers,
	);
}

/**
 * Enrich a merged page with checks, additions/deletions, and the base
 * branch: one GraphQL batch per repo that has rows on the page. Keyed by
 * (projectId, prNumber) — PR numbers can collide across repos.
 */
async function enrichPageWithChecks(
	pullRequests: PullRequestResult[],
	projectRepos: ProjectRepo[],
	getChecks: (
		repo: ResolvedGithubRepo,
		pullRequestNumbers: number[],
	) => Promise<Map<number, PullRequestEnrichment>>,
): Promise<PullRequestResult[]> {
	const numbersByProject = new Map<string, number[]>();
	for (const pullRequest of pullRequests) {
		const numbers = numbersByProject.get(pullRequest.projectId) ?? [];
		numbers.push(pullRequest.prNumber);
		numbersByProject.set(pullRequest.projectId, numbers);
	}
	const repoByProject = new Map(
		projectRepos.map(({ projectId, repo }) => [projectId, repo]),
	);
	const checksByProject = new Map<string, Map<number, PullRequestEnrichment>>();
	await Promise.all(
		[...numbersByProject].map(async ([projectId, numbers]) => {
			const repo = repoByProject.get(projectId);
			if (!repo) return;
			checksByProject.set(projectId, await getChecks(repo, numbers));
		}),
	);
	return pullRequests.map((pullRequest) => ({
		...pullRequest,
		...checksByProject.get(pullRequest.projectId)?.get(pullRequest.prNumber),
	}));
}

export const searchPullRequests = protectedProcedure
	.input(searchPullRequestsInputSchema)
	.query(async ({ ctx, input }): Promise<PullRequestsPage> => {
		const projectIds = input.projectIds ?? [input.projectId];
		const projectRepos: ProjectRepo[] = await resolveProjectRepos(
			projectIds,
			input.projectIds !== undefined,
			(projectId) => resolveGithubRepo(ctx, projectId),
		);
		if (projectRepos.length === 0) {
			return emptyPullRequestsPage(input.page ?? 1);
		}
		const limit = input.limit ?? 30;
		const page = input.page ?? 1;

		const raw = input.query?.trim() ?? "";
		const normalizedTargets = projectRepos.map((projectRepo) => ({
			projectRepo,
			normalized: normalizeGitHubQuery(raw, projectRepo.repo, "pull"),
		}));
		const directEntries = normalizedTargets.filter(
			({ normalized }) => normalized.isDirectLookup,
		);
		const directTargets = directEntries.map(({ projectRepo }) => projectRepo);

		// A same-kind GitHub URL either direct-matches a repo or mismatches
		// it, so no direct target + any mismatch ⇒ every repo mismatched.
		if (
			directTargets.length === 0 &&
			normalizedTargets.some(({ normalized }) => normalized.repoMismatch)
		) {
			return {
				pullRequests: [],
				totalCount: 0,
				hasNextPage: false,
				page,
				repoMismatch: formatRepoList(projectRepos),
			};
		}

		const lookupNumber = directEntries[0]
			? Number.parseInt(directEntries[0].normalized.query, 10)
			: null;

		const effectiveQuery = [
			normalizedTargets[0]?.normalized.query ?? "",
			input.author ? `author:${input.author}` : "",
			input.review ? REVIEW_QUERY_BY_FILTER[input.review] : "",
		]
			.filter(Boolean)
			.join(" ");
		const qualifiers = [
			"is:pr",
			input.includeClosed ? "" : "is:open",
			effectiveQuery,
		]
			.filter(Boolean)
			.join(" ");

		// gh-first uses the user's local `gh auth login`; falls back to
		// Octokit when gh is missing, unauthed, or errors.
		try {
			if (lookupNumber !== null) {
				const single = directTargets.length === 1 ? directTargets[0] : null;
				if (single) {
					const pullRequest = await ghDirectLookupRow(
						ctx.execGh,
						single,
						lookupNumber,
						input.author,
						input.review,
					);
					if (!pullRequest) return emptyPullRequestsPage(page);
					return {
						pullRequests: [pullRequest],
						totalCount: 1,
						hasNextPage: false,
						page,
					};
				}
				// Bare `#N` fans out one `gh pr view` per repo — core quota,
				// not search quota. Repos without that number just miss.
				const settled = await Promise.allSettled(
					directTargets.map((target) =>
						ghDirectLookupRow(
							ctx.execGh,
							target,
							lookupNumber,
							input.author,
							input.review,
						),
					),
				);
				const found: PullRequestResult[] = [];
				for (const result of settled) {
					if (result.status === "fulfilled") {
						if (result.value) found.push(result.value);
					} else if (!isGithubNotFoundError(result.reason)) {
						throw result.reason;
					}
				}
				return {
					pullRequests: mergeByUpdatedAtDesc([found]),
					totalCount: found.length,
					hasNextPage: false,
					page,
				};
			}

			const chunks = chunkProjectRepos(projectRepos, qualifiers);
			const chunkResults = await Promise.all(
				chunks.map((chunk) =>
					ghApiSearchPullRequests(ctx.execGh, chunk, qualifiers, page, limit),
				),
			);
			const merged = mergeByUpdatedAtDesc(
				chunkResults.map((result) => result.items),
			);
			let pullRequests = merged;
			try {
				pullRequests = await enrichPageWithChecks(
					merged,
					projectRepos,
					(repo, numbers) => ghGetPullRequestChecks(ctx.execGh, repo, numbers),
				);
			} catch (checksError) {
				console.warn(
					"[workspaceCreation.searchPullRequests] failed to enrich checks",
					checksError,
				);
			}
			return {
				pullRequests,
				totalCount: chunkResults.reduce(
					(sum, result) => sum + result.totalCount,
					0,
				),
				hasNextPage: chunkResults.some((result) => result.hasNextPage),
				page,
			};
		} catch (ghErr) {
			// A rate-limited gh call surfaces as-is — falling back to Octokit
			// would retry against the same user's quota.
			if (isGithubRateLimitError(ghErr)) throw githubRateLimitError(ghErr);
			console.warn(
				"[workspaceCreation.searchPullRequests] gh path failed; falling back to Octokit",
				ghErr,
			);
		}

		const octokit = await ctx.github();

		try {
			if (lookupNumber !== null) {
				const single = directTargets.length === 1 ? directTargets[0] : null;
				if (single) {
					const pullRequest = await octokitDirectLookupRow(
						octokit,
						single,
						lookupNumber,
						input.author,
						input.review,
					);
					if (!pullRequest) return emptyPullRequestsPage(page);
					return {
						pullRequests: [pullRequest],
						totalCount: 1,
						hasNextPage: false,
						page,
					};
				}
				const settled = await Promise.allSettled(
					directTargets.map((target) =>
						octokitDirectLookupRow(
							octokit,
							target,
							lookupNumber,
							input.author,
							input.review,
						),
					),
				);
				const found: PullRequestResult[] = [];
				for (const result of settled) {
					if (result.status === "fulfilled") {
						if (result.value) found.push(result.value);
					} else if (!isGithubNotFoundError(result.reason)) {
						throw result.reason;
					}
				}
				return {
					pullRequests: mergeByUpdatedAtDesc([found]),
					totalCount: found.length,
					hasNextPage: false,
					page,
				};
			}

			const chunks = chunkProjectRepos(projectRepos, qualifiers);
			const chunkResults = await Promise.all(
				chunks.map((chunk) =>
					octokitSearchPullRequests(octokit, chunk, qualifiers, page, limit),
				),
			);
			const merged = mergeByUpdatedAtDesc(
				chunkResults.map((result) => result.items),
			);
			let pullRequests = merged;
			try {
				pullRequests = await enrichPageWithChecks(
					merged,
					projectRepos,
					(repo, numbers) =>
						getPullRequestChecksViaGraphql(
							(checksQuery, variables) =>
								octokit.graphql(checksQuery, variables),
							repo,
							numbers,
						),
				);
			} catch (checksError) {
				console.warn(
					"[workspaceCreation.searchPullRequests] failed to enrich checks via Octokit",
					checksError,
				);
			}
			return {
				pullRequests,
				totalCount: chunkResults.reduce(
					(sum, result) => sum + result.totalCount,
					0,
				),
				hasNextPage: chunkResults.some((result) => result.hasNextPage),
				page,
			};
		} catch (err) {
			if (isGithubRateLimitError(err)) throw githubRateLimitError(err);
			// Both gh and Octokit failed — rethrow so the renderer's toast
			// fires instead of the dropdown silently rendering "no results".
			console.warn(
				"[workspaceCreation.searchPullRequests] octokit fallback failed",
				err,
			);
			throw err;
		}
	});
