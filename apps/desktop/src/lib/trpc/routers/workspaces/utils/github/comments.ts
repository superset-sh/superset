import type { PullRequestComment } from "@superset/local-db";
import { execWithShellEnv } from "../shell-env";
import {
	GHIssueCommentSchema,
	GHReviewCommentSchema,
	GHReviewThreadCommentsConnectionSchema,
	GHReviewThreadCommentsResponseSchema,
	GHReviewThreadsResponseSchema,
} from "./types";

const REVIEW_THREADS_QUERY = `
query PullRequestReviewThreads(
	$owner: String!
	$name: String!
	$pullRequestNumber: Int!
	$after: String
) {
	repository(owner: $owner, name: $name) {
		pullRequest(number: $pullRequestNumber) {
			reviewThreads(first: 100, after: $after) {
				nodes {
					id
					isResolved
					comments(first: 100) {
						nodes {
							databaseId
						}
						pageInfo {
							hasNextPage
							endCursor
						}
					}
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
}
`;

const REVIEW_THREAD_COMMENTS_QUERY = `
query PullRequestReviewThreadComments($threadId: ID!, $after: String) {
	node(id: $threadId) {
		... on PullRequestReviewThread {
			comments(first: 100, after: $after) {
				nodes {
					databaseId
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
}
`;

function parseTimestamp(value?: string): number | undefined {
	if (!value) {
		return undefined;
	}

	const timestamp = new Date(value).getTime();
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

export function parsePaginatedApiArray(stdout: string): unknown[] {
	const trimmed = stdout.trim();
	if (!trimmed || trimmed === "null") {
		return [];
	}

	try {
		const raw = JSON.parse(trimmed);
		if (!Array.isArray(raw)) {
			return [];
		}

		return raw.flatMap((page) => (Array.isArray(page) ? page : [page]));
	} catch (error) {
		console.warn(
			"[GitHub] Failed to parse paginated API array response:",
			error instanceof Error ? error.message : String(error),
		);
		return [];
	}
}

export function parseReviewCommentsResponse(
	raw: unknown[],
	resolvedReviewCommentIds: ReadonlySet<number> = new Set<number>(),
): PullRequestComment[] {
	return raw
		.flatMap((item) => {
			const result = GHReviewCommentSchema.safeParse(item);
			if (!result.success) {
				return [];
			}

			const comment = result.data;
			const body = comment.body?.trim();
			if (!body) {
				return [];
			}

			return [
				{
					id: `review-${comment.id}`,
					authorLogin: comment.user?.login || "github",
					...(comment.user?.avatar_url
						? { avatarUrl: comment.user.avatar_url }
						: {}),
					body,
					createdAt: parseTimestamp(comment.created_at),
					url: comment.html_url,
					kind: "review" as const,
					path: comment.path,
					line: comment.line ?? comment.original_line ?? undefined,
					isResolved: resolvedReviewCommentIds.has(comment.id),
				},
			];
		})
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function parseConversationCommentsResponse(
	raw: unknown[],
): PullRequestComment[] {
	return raw
		.flatMap((item) => {
			const result = GHIssueCommentSchema.safeParse(item);
			if (!result.success) {
				return [];
			}

			const comment = result.data;
			const body = comment.body?.trim();
			if (!body) {
				return [];
			}

			return [
				{
					id: `conversation-${comment.id}`,
					authorLogin: comment.user?.login || "github",
					...(comment.user?.avatar_url
						? { avatarUrl: comment.user.avatar_url }
						: {}),
					body,
					createdAt: parseTimestamp(comment.created_at),
					url: comment.html_url,
					kind: "conversation" as const,
					isResolved: false,
				},
			];
		})
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function mergePullRequestComments(
	...commentGroups: PullRequestComment[][]
): PullRequestComment[] {
	const commentsById = new Map<string, PullRequestComment>();

	for (const group of commentGroups) {
		for (const comment of group) {
			commentsById.set(comment.id, comment);
		}
	}

	return [...commentsById.values()].sort(
		(a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
	);
}

async function fetchPaginatedCommentsEndpoint(
	worktreePath: string,
	endpoint: string,
): Promise<unknown[]> {
	const { stdout } = await execWithShellEnv(
		"gh",
		["api", "--paginate", "--slurp", endpoint],
		{ cwd: worktreePath },
	);

	return parsePaginatedApiArray(stdout);
}

async function fetchResolvedReviewCommentIdsForPullRequest(
	worktreePath: string,
	repoNameWithOwner: string,
	pullRequestNumber: number,
): Promise<Set<number>> {
	const [owner, name] = repoNameWithOwner.split("/");
	if (!owner || !name) {
		return new Set<number>();
	}

	const resolvedIds = new Set<number>();
	let afterCursor: string | null = null;

	while (true) {
		const args = [
			"api",
			"graphql",
			"-f",
			`query=${REVIEW_THREADS_QUERY}`,
			"-F",
			`owner=${owner}`,
			"-F",
			`name=${name}`,
			"-F",
			`pullRequestNumber=${pullRequestNumber}`,
		];
		if (afterCursor) {
			args.push("-F", `after=${afterCursor}`);
		}

		const { stdout } = await execWithShellEnv("gh", args, {
			cwd: worktreePath,
		});
		const parsed = GHReviewThreadsResponseSchema.safeParse(
			JSON.parse(stdout.trim()),
		);
		if (!parsed.success) {
			console.warn(
				"[GitHub] Failed to parse pull request review threads response:",
				parsed.error.message,
			);
			return resolvedIds;
		}

		const reviewThreads =
			parsed.data.data.repository?.pullRequest?.reviewThreads ?? null;
		if (!reviewThreads) {
			return resolvedIds;
		}

		for (const thread of reviewThreads.nodes ?? []) {
			if (!thread) {
				continue;
			}

			if (!thread.isResolved) {
				continue;
			}

			addResolvedReviewCommentIds(resolvedIds, thread.comments);

			if (
				thread.id &&
				thread.comments?.pageInfo.hasNextPage &&
				thread.comments.pageInfo.endCursor
			) {
				await fetchAdditionalResolvedReviewCommentIdsForThread({
					worktreePath,
					threadId: thread.id,
					initialAfterCursor: thread.comments.pageInfo.endCursor,
					resolvedIds,
				});
			}
		}

		if (
			!reviewThreads.pageInfo.hasNextPage ||
			!reviewThreads.pageInfo.endCursor
		) {
			return resolvedIds;
		}

		afterCursor = reviewThreads.pageInfo.endCursor;
	}
}

function addResolvedReviewCommentIds(
	resolvedIds: Set<number>,
	comments: unknown,
): void {
	const parsed = GHReviewThreadCommentsConnectionSchema.safeParse(comments);
	if (!parsed.success) {
		return;
	}

	for (const comment of parsed.data.nodes ?? []) {
		if (comment && typeof comment.databaseId === "number") {
			resolvedIds.add(comment.databaseId);
		}
	}
}

async function fetchAdditionalResolvedReviewCommentIdsForThread({
	worktreePath,
	threadId,
	initialAfterCursor,
	resolvedIds,
}: {
	worktreePath: string;
	threadId: string;
	initialAfterCursor: string;
	resolvedIds: Set<number>;
}): Promise<void> {
	let afterCursor: string | null = initialAfterCursor;

	while (afterCursor) {
		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"api",
				"graphql",
				"-f",
				`query=${REVIEW_THREAD_COMMENTS_QUERY}`,
				"-F",
				`threadId=${threadId}`,
				"-F",
				`after=${afterCursor}`,
			],
			{ cwd: worktreePath },
		);
		const parsed = GHReviewThreadCommentsResponseSchema.safeParse(
			JSON.parse(stdout.trim()),
		);
		if (!parsed.success) {
			console.warn(
				"[GitHub] Failed to parse pull request review thread comments response:",
				parsed.error.message,
			);
			return;
		}

		const comments = parsed.data.data.node?.comments;
		if (!comments) {
			return;
		}

		addResolvedReviewCommentIds(resolvedIds, comments);
		afterCursor =
			comments.pageInfo.hasNextPage && comments.pageInfo.endCursor
				? comments.pageInfo.endCursor
				: null;
	}
}

async function fetchConversationCommentsForPullRequest(
	worktreePath: string,
	repoNameWithOwner: string,
	pullRequestNumber: number,
): Promise<PullRequestComment[]> {
	const pages = await fetchPaginatedCommentsEndpoint(
		worktreePath,
		`repos/${repoNameWithOwner}/issues/${pullRequestNumber}/comments?per_page=100`,
	);

	return parseConversationCommentsResponse(pages);
}

export async function fetchPullRequestComments({
	worktreePath,
	repoNameWithOwner,
	pullRequestNumber,
}: {
	worktreePath: string;
	repoNameWithOwner: string;
	pullRequestNumber: number;
}): Promise<PullRequestComment[]> {
	const [reviewPagesResult, resolvedIdsResult, conversationResult] =
		await Promise.allSettled([
			fetchPaginatedCommentsEndpoint(
				worktreePath,
				`repos/${repoNameWithOwner}/pulls/${pullRequestNumber}/comments?per_page=100`,
			),
			fetchResolvedReviewCommentIdsForPullRequest(
				worktreePath,
				repoNameWithOwner,
				pullRequestNumber,
			),
			fetchConversationCommentsForPullRequest(
				worktreePath,
				repoNameWithOwner,
				pullRequestNumber,
			),
		]);

	const resolvedReviewCommentIds =
		resolvedIdsResult.status === "fulfilled"
			? resolvedIdsResult.value
			: new Set<number>();
	const reviewComments =
		reviewPagesResult.status === "fulfilled"
			? parseReviewCommentsResponse(
					reviewPagesResult.value,
					resolvedReviewCommentIds,
				)
			: [];
	const conversationComments =
		conversationResult.status === "fulfilled" ? conversationResult.value : [];

	if (reviewPagesResult.status === "rejected") {
		console.warn(
			"[GitHub] Failed to fetch pull request review comments:",
			reviewPagesResult.reason,
		);
	}

	if (resolvedIdsResult.status === "rejected") {
		console.warn(
			"[GitHub] Failed to fetch pull request review thread resolution state:",
			resolvedIdsResult.reason,
		);
	}

	if (conversationResult.status === "rejected") {
		console.warn(
			"[GitHub] Failed to fetch pull request conversation comments:",
			conversationResult.reason,
		);
	}

	return mergePullRequestComments(reviewComments, conversationComments);
}
