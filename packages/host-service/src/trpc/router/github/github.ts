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

			const checks = (pr.statusCheckRollup?.contexts?.nodes ?? []).flatMap(
				(node) => {
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
				},
			);

			const threads = pr.reviewThreads?.nodes ?? [];
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
				throw mergeRejectionError(error);
			}
		}),
});

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
			reviewThreads(first: 100) { nodes { isResolved isOutdated } }
			statusCheckRollup {
				contexts(first: 100) {
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
			reviewThreads: {
				nodes: ({ isResolved: boolean; isOutdated: boolean } | null)[];
			} | null;
			statusCheckRollup: {
				contexts: {
					nodes: ({
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
					} | null)[];
				} | null;
			} | null;
		} | null;
	} | null;
}

/**
 * GitHub rejects merges for conflicts, branch protection, missing reviews and
 * stale heads. Those are states of the PR, not host bugs, so they get a
 * non-500 code (500s page Sentry) and GitHub's own wording, which is the only
 * text that says which of them happened.
 */
function mergeRejectionError(error: unknown): TRPCError {
	const status =
		typeof error === "object" && error !== null && "status" in error
			? Number((error as { status: unknown }).status)
			: null;
	const message =
		error instanceof Error && error.message
			? error.message
			: "GitHub refused the merge.";

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
