import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";

export const githubRouter = router({
	getPRStatus: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				branch: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.list({
				owner: input.owner,
				repo: input.repo,
				head: `${input.owner}:${input.branch}`,
				state: "open",
			});
			return data[0] ?? null;
		}),

	getPR: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.get({
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pullNumber,
			});
			return data;
		}),

	listPRs: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				state: z.enum(["open", "closed", "all"]).default("open"),
				sort: z
					.enum(["created", "updated", "popularity", "long-running"])
					.default("updated"),
				direction: z.enum(["asc", "desc"]).default("desc"),
				perPage: z.number().min(1).max(100).default(30),
				page: z.number().min(1).default(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.list({
				owner: input.owner,
				repo: input.repo,
				state: input.state,
				sort: input.sort,
				direction: input.direction,
				per_page: input.perPage,
				page: input.page,
			});
			return data;
		}),

	getRepo: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.get({
				owner: input.owner,
				repo: input.repo,
			});
			return data;
		}),

	listDeployments: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				environment: z.string().optional(),
				ref: z.string().optional(),
				perPage: z.number().min(1).max(100).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.listDeployments({
				owner: input.owner,
				repo: input.repo,
				environment: input.environment,
				ref: input.ref,
				per_page: input.perPage,
			});
			return data;
		}),

	listDeploymentStatuses: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				deploymentId: z.number(),
				perPage: z.number().min(1).max(100).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.listDeploymentStatuses({
				owner: input.owner,
				repo: input.repo,
				deployment_id: input.deploymentId,
				per_page: input.perPage,
			});
			return data;
		}),

	getUser: protectedProcedure.query(async ({ ctx }) => {
		const octokit = await ctx.github();
		const { data } = await octokit.users.getAuthenticated();
		return data;
	}),

	/**
	 * Everything one pull request view needs, in a single round trip.
	 *
	 * Deliberately GraphQL and deliberately live: mergeability, per-viewer
	 * capabilities, reviewer states and whether a check is required exist
	 * nowhere in the synced rows, and a button offered on stale data is a
	 * button that fails when pressed.
	 */
	getPullRequestDetail: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const data = await octokit.graphql<PullRequestDetailQuery>(
				PULL_REQUEST_DETAIL_QUERY,
				{ owner: input.owner, name: input.repo, number: input.pullNumber },
			);
			const pr = data.repository?.pullRequest;
			if (!pr) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Pull request #${input.pullNumber} not found.`,
				});
			}

			const reviewers = new Map<
				string,
				{
					login: string;
					avatarUrl: string | null;
					isTeam: boolean;
					state: string;
				}
			>();
			// Requested first, so an actual review overwrites the placeholder.
			for (const node of pr.reviewRequests?.nodes ?? []) {
				const who = node?.requestedReviewer;
				if (!who) continue;
				const login = who.login ?? who.name;
				if (!login) continue;
				reviewers.set(login, {
					login,
					avatarUrl: who.avatarUrl ?? null,
					isTeam: who.login === undefined,
					state: "REQUESTED",
				});
			}
			for (const node of pr.latestOpinionatedReviews?.nodes ?? []) {
				const who = node?.author;
				if (!node || !who?.login) continue;
				reviewers.set(who.login, {
					login: who.login,
					avatarUrl: who.avatarUrl ?? null,
					isTeam: false,
					state: node.state,
				});
			}

			// Both connections page at 100; anything past the first page must be
			// fetched before grading, or a failing check or open thread there is
			// silently invisible.
			const [restThreads, restContexts] = await Promise.all([
				drainReviewThreads(octokit, input, pr.reviewThreads?.pageInfo),
				drainCheckContexts(
					octokit,
					input,
					pr.statusCheckRollup?.contexts?.pageInfo,
				),
			]);
			const contextNodes = (pr.statusCheckRollup?.contexts?.nodes ?? []).concat(
				restContexts,
			);

			const checks = contextNodes.flatMap((node) => {
				if (!node) return [];
				if (node.__typename === "CheckRun") {
					return [
						{
							name: node.name ?? "Check",
							status: node.status ?? "COMPLETED",
							conclusion: node.conclusion ?? null,
							isRequired: node.isRequired ?? false,
							startedAt: node.startedAt ?? null,
							completedAt: node.completedAt ?? null,
							detailsUrl: node.detailsUrl ?? null,
						},
					];
				}
				// A commit status has no runtime of its own, only a verdict.
				return [
					{
						name: node.context ?? "Status",
						status: "COMPLETED",
						conclusion:
							node.state === "SUCCESS"
								? "SUCCESS"
								: node.state === "PENDING"
									? null
									: "FAILURE",
						isRequired: node.isRequired ?? false,
						startedAt: null,
						completedAt: node.createdAt ?? null,
						detailsUrl: node.targetUrl ?? null,
					},
				];
			});

			const threads = (pr.reviewThreads?.nodes ?? []).concat(restThreads);
			const allowed: string[] = [];
			if (data.repository?.squashMergeAllowed) allowed.push("squash");
			if (data.repository?.mergeCommitAllowed) allowed.push("merge");
			if (data.repository?.rebaseMergeAllowed) allowed.push("rebase");

			return {
				pullRequest: {
					id: pr.id,
					number: pr.number,
					title: pr.title,
					body: pr.body,
					url: pr.url,
					baseBranch: pr.baseRefName,
					state: pr.merged
						? "merged"
						: pr.state === "CLOSED"
							? "closed"
							: "open",
					isDraft: pr.isDraft,
					additions: pr.additions,
					deletions: pr.deletions,
					changedFiles: pr.changedFiles,
					mergedAt: pr.mergedAt,
					mergedBy: pr.mergedBy
						? {
								login: pr.mergedBy.login,
								avatarUrl: pr.mergedBy.avatarUrl ?? null,
							}
						: null,
				},
				checks,
				reviewers: [...reviewers.values()],
				mergeability: {
					mergeable: pr.mergeable,
					mergeStateStatus: pr.mergeStateStatus,
					approvals: (pr.latestOpinionatedReviews?.nodes ?? []).filter(
						(node) => node?.state === "APPROVED",
					).length,
					requiredApprovals:
						pr.baseRef?.branchProtectionRule?.requiredApprovingReviewCount ?? 0,
					// GitHub's own verdict, and the only one that sees rulesets — a
					// repository that requires review through a ruleset has no
					// branchProtectionRule at all, so the count above reads 0.
					reviewDecision: pr.reviewDecision,
					unresolvedThreads: threads.filter(
						(node) => node && !node.isResolved && !node.isOutdated,
					).length,
					requiresThreadResolution:
						pr.baseRef?.branchProtectionRule?.requiresConversationResolution ??
						false,
					queue: pr.mergeQueueEntry
						? {
								position: pr.mergeQueueEntry.position ?? null,
								state: pr.mergeQueueEntry.state,
							}
						: null,
					allowedMergeMethods: allowed,
				},
				capabilities: {
					// Permission only. Whether GitHub would accept the merge right now
					// is mergeStateStatus's job — gating the button on mergeability
					// makes it vanish while GitHub is still computing it.
					merge: pr.viewerCanMergeAsAdmin || pr.viewerCanUpdate,
					markReady: pr.isDraft && pr.viewerCanUpdate,
					updateBranch: pr.mergeStateStatus === "BEHIND" && pr.viewerCanUpdate,
					reopen: pr.state === "CLOSED" && !pr.merged && pr.viewerCanUpdate,
					dequeue: pr.mergeQueueEntry !== null && pr.viewerCanUpdate,
				},
			};
		}),

	mergePR: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
				mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				const { data } = await octokit.pulls.merge({
					owner: input.owner,
					repo: input.repo,
					pull_number: input.pullNumber,
					merge_method: input.mergeMethod,
				});
				return data;
			} catch (error) {
				throw actionRejectionError(error, "GitHub refused the merge.");
			}
		}),

	markPullRequestReady: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				const id = await pullRequestNodeId(octokit, input);
				await octokit.graphql(
					`mutation($id: ID!) {
						markPullRequestReadyForReview(input: { pullRequestId: $id }) {
							pullRequest { isDraft }
						}
					}`,
					{ id },
				);
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to mark the pull request ready.",
				);
			}
		}),

	updatePullRequestBranch: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				await octokit.pulls.updateBranch({
					owner: input.owner,
					repo: input.repo,
					pull_number: input.pullNumber,
				});
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to update the branch.",
				);
			}
		}),

	reopenPullRequest: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				await octokit.pulls.update({
					owner: input.owner,
					repo: input.repo,
					pull_number: input.pullNumber,
					state: "open",
				});
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to reopen the pull request.",
				);
			}
		}),

	dequeuePullRequest: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			try {
				const id = await pullRequestNodeId(octokit, input);
				await octokit.graphql(
					`mutation($id: ID!) {
						dequeuePullRequest(input: { id: $id }) {
							mergeQueueEntry { position }
						}
					}`,
					{ id },
				);
			} catch (error) {
				throw actionRejectionError(
					error,
					"GitHub refused to remove the pull request from the queue.",
				);
			}
		}),
});

/** The GraphQL mutations address the pull request by node id, not number. */
async function pullRequestNodeId(
	octokit: {
		graphql: <T>(
			query: string,
			variables: Record<string, unknown>,
		) => Promise<T>;
	},
	input: { owner: string; repo: string; pullNumber: number },
): Promise<string> {
	const data = await octokit.graphql<{
		repository: { pullRequest: { id: string } | null } | null;
	}>(
		`query($owner: String!, $name: String!, $number: Int!) {
			repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
		}`,
		{ owner: input.owner, name: input.repo, number: input.pullNumber },
	);
	const id = data.repository?.pullRequest?.id;
	if (!id) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Pull request #${input.pullNumber} not found.`,
		});
	}
	return id;
}

/**
 * One round trip for the whole view. `isRequired` is asked per pull request
 * because a check is only required relative to the branch rules it runs under.
 */
const PULL_REQUEST_DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		squashMergeAllowed
		mergeCommitAllowed
		rebaseMergeAllowed
		pullRequest(number: $number) {
			id number title body url baseRefName state isDraft merged mergedAt
			additions deletions changedFiles
			mergeable mergeStateStatus reviewDecision
			viewerCanUpdate viewerCanMergeAsAdmin
			mergedBy { login avatarUrl }
			mergeQueueEntry { position state }
			baseRef {
				branchProtectionRule {
					requiredApprovingReviewCount
					requiresConversationResolution
				}
			}
			latestOpinionatedReviews(first: 20) {
				nodes { state author { login avatarUrl } }
			}
			reviewRequests(first: 20) {
				nodes {
					requestedReviewer {
						__typename
						... on User { login avatarUrl }
						... on Team { name avatarUrl }
					}
				}
			}
			reviewThreads(first: 100) {
				pageInfo { hasNextPage endCursor }
				nodes { isResolved isOutdated }
			}
			statusCheckRollup {
				contexts(first: 100) {
					pageInfo { hasNextPage endCursor }
					nodes {
						__typename
						... on CheckRun {
							name status conclusion detailsUrl startedAt completedAt
							isRequired(pullRequestNumber: $number)
						}
						... on StatusContext {
							context state targetUrl createdAt
							isRequired(pullRequestNumber: $number)
						}
					}
				}
			}
		}
	}
}`;

const REVIEW_THREADS_PAGE_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $cursor: String!) {
	repository(owner: $owner, name: $name) {
		pullRequest(number: $number) {
			reviewThreads(first: 100, after: $cursor) {
				pageInfo { hasNextPage endCursor }
				nodes { isResolved isOutdated }
			}
		}
	}
}`;

const CHECK_CONTEXTS_PAGE_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $cursor: String!) {
	repository(owner: $owner, name: $name) {
		pullRequest(number: $number) {
			statusCheckRollup {
				contexts(first: 100, after: $cursor) {
					pageInfo { hasNextPage endCursor }
					nodes {
						__typename
						... on CheckRun {
							name status conclusion detailsUrl startedAt completedAt
							isRequired(pullRequestNumber: $number)
						}
						... on StatusContext {
							context state targetUrl createdAt
							isRequired(pullRequestNumber: $number)
						}
					}
				}
			}
		}
	}
}`;

interface PullRequestDetailQuery {
	repository: {
		squashMergeAllowed: boolean;
		mergeCommitAllowed: boolean;
		rebaseMergeAllowed: boolean;
		pullRequest: {
			id: string;
			number: number;
			title: string;
			body: string;
			url: string;
			baseRefName: string;
			state: string;
			isDraft: boolean;
			merged: boolean;
			mergedAt: string | null;
			additions: number;
			deletions: number;
			changedFiles: number;
			mergeable: string;
			mergeStateStatus: string;
			reviewDecision: string | null;
			viewerCanUpdate: boolean;
			viewerCanMergeAsAdmin: boolean;
			mergedBy: { login: string; avatarUrl: string | null } | null;
			mergeQueueEntry: { position: number | null; state: string } | null;
			baseRef: {
				branchProtectionRule: {
					requiredApprovingReviewCount: number | null;
					requiresConversationResolution: boolean | null;
				} | null;
			} | null;
			latestOpinionatedReviews: {
				nodes: ({
					state: string;
					author: { login: string; avatarUrl: string | null } | null;
				} | null)[];
			} | null;
			reviewRequests: {
				nodes: ({
					requestedReviewer: {
						__typename: string;
						login?: string;
						name?: string;
						avatarUrl?: string | null;
					} | null;
				} | null)[];
			} | null;
			reviewThreads: ReviewThreadsConnection | null;
			statusCheckRollup: {
				contexts: CheckContextsConnection | null;
			} | null;
		} | null;
	} | null;
}

interface ConnectionPageInfo {
	hasNextPage: boolean;
	endCursor: string | null;
}

interface ReviewThreadNode {
	isResolved: boolean;
	isOutdated: boolean;
}

interface ReviewThreadsConnection {
	pageInfo: ConnectionPageInfo;
	nodes: (ReviewThreadNode | null)[];
}

interface CheckContextNode {
	__typename: string;
	name?: string;
	status?: string;
	conclusion?: string | null;
	detailsUrl?: string | null;
	startedAt?: string | null;
	completedAt?: string | null;
	context?: string;
	state?: string;
	targetUrl?: string | null;
	createdAt?: string | null;
	isRequired?: boolean;
}

interface CheckContextsConnection {
	pageInfo: ConnectionPageInfo;
	nodes: (CheckContextNode | null)[];
}

interface GithubGraphqlClient {
	graphql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
}

/**
 * 100 nodes is GitHub's page cap, not a promise of completeness — a failing
 * required check or an open thread past the first page would otherwise never
 * be seen, and the card would grade a partial pull request as ready. Drains
 * the connection; a handful of round trips at most.
 */
// GitHub's own flags are trusted but not absolutely: a stuck cursor from a
// GitHub-side pagination bug must not turn one detail query into an infinite
// loop that pins the host and burns the token's rate limit. 20 pages is
// 2,000 nodes — far past any real pull request.
const MAX_DRAIN_PAGES = 20;

async function drainReviewThreads(
	octokit: GithubGraphqlClient,
	input: { owner: string; repo: string; pullNumber: number },
	pageInfo: ConnectionPageInfo | undefined,
): Promise<(ReviewThreadNode | null)[]> {
	const nodes: (ReviewThreadNode | null)[] = [];
	let page = pageInfo ?? null;
	let pages = 0;
	while (page?.hasNextPage) {
		// hasNextPage with no cursor would end the loop on a partial set —
		// the silent truncation this drain exists to remove.
		if (!page.endCursor) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `GitHub reported more review threads but no cursor for pull request #${input.pullNumber}.`,
			});
		}
		if (++pages > MAX_DRAIN_PAGES) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Pull request #${input.pullNumber} did not finish paginating review threads after ${MAX_DRAIN_PAGES} pages.`,
			});
		}
		const data = await octokit.graphql<{
			repository: {
				pullRequest: { reviewThreads: ReviewThreadsConnection | null } | null;
			} | null;
		}>(REVIEW_THREADS_PAGE_QUERY, {
			owner: input.owner,
			name: input.repo,
			number: input.pullNumber,
			cursor: page.endCursor,
		});
		const connection = data.repository?.pullRequest?.reviewThreads;
		// A missing page mid-drain would silently re-create the truncation this
		// drain exists to remove — fail the query instead of grading on less.
		if (!connection) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `GitHub returned no reviewThreads page for pull request #${input.pullNumber} while paginating.`,
			});
		}
		nodes.push(...connection.nodes);
		page = connection.pageInfo;
	}
	return nodes;
}

async function drainCheckContexts(
	octokit: GithubGraphqlClient,
	input: { owner: string; repo: string; pullNumber: number },
	pageInfo: ConnectionPageInfo | undefined,
): Promise<(CheckContextNode | null)[]> {
	const nodes: (CheckContextNode | null)[] = [];
	let page = pageInfo ?? null;
	let pages = 0;
	while (page?.hasNextPage) {
		if (!page.endCursor) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `GitHub reported more checks but no cursor for pull request #${input.pullNumber}.`,
			});
		}
		if (++pages > MAX_DRAIN_PAGES) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Pull request #${input.pullNumber} did not finish paginating checks after ${MAX_DRAIN_PAGES} pages.`,
			});
		}
		const data = await octokit.graphql<{
			repository: {
				pullRequest: {
					statusCheckRollup: {
						contexts: CheckContextsConnection | null;
					} | null;
				} | null;
			} | null;
		}>(CHECK_CONTEXTS_PAGE_QUERY, {
			owner: input.owner,
			name: input.repo,
			number: input.pullNumber,
			cursor: page.endCursor,
		});
		const connection =
			data.repository?.pullRequest?.statusCheckRollup?.contexts;
		if (!connection) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `GitHub returned no check contexts page for pull request #${input.pullNumber} while paginating.`,
			});
		}
		nodes.push(...connection.nodes);
		page = connection.pageInfo;
	}
	return nodes;
}

/**
 * GitHub rejects pull request actions for conflicts, branch protection,
 * missing reviews and stale heads. Those are states of the PR, not host bugs,
 * so they get a non-500 code (500s page Sentry) and GitHub's own wording,
 * which is the only text that says which of them happened.
 */
export function actionRejectionError(
	error: unknown,
	fallback: string,
): TRPCError {
	if (error instanceof TRPCError) return error;

	const status =
		typeof error === "object" && error !== null && "status" in error
			? Number((error as { status: unknown }).status)
			: null;
	const message =
		error instanceof Error && error.message ? error.message : fallback;

	// GraphQL rejections arrive as errors in a 200 response — no status, but
	// still the PR's state talking (already queued, not in a queue, not draft).
	if (
		status === null &&
		typeof error === "object" &&
		error !== null &&
		"errors" in error
	) {
		return new TRPCError({ code: "BAD_REQUEST", message, cause: error });
	}

	switch (status) {
		// 405 not mergeable (conflicts/draft), 409 head branch moved on.
		case 405:
		case 409:
			return new TRPCError({ code: "CONFLICT", message, cause: error });
		case 401:
			return new TRPCError({ code: "UNAUTHORIZED", message, cause: error });
		case 403:
			return new TRPCError({ code: "FORBIDDEN", message, cause: error });
		case 404:
			return new TRPCError({ code: "NOT_FOUND", message, cause: error });
		case 422:
			return new TRPCError({ code: "BAD_REQUEST", message, cause: error });
		default:
			return new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message,
				cause: error,
			});
	}
}
