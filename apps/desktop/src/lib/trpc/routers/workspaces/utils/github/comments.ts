import type { PullRequestComment } from "@superset/local-db";
import type { z } from "zod";
import { execWithShellEnv } from "../shell-env";
import {
	GHIssueCommentSchema,
	type GHReviewThreadCommentSchema,
	GHReviewThreadCommentsConnectionSchema,
	GHReviewThreadCommentsResponseSchema,
	GHReviewThreadSchema,
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
							id
							databaseId
							author {
								login
								avatarUrl
							}
							body
							createdAt
							url
							path
							line
							originalLine
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
					id
					databaseId
					author {
						login
						avatarUrl
					}
					body
					createdAt
					url
					path
					line
					originalLine
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

type ReviewThreadCommentNode = z.infer<typeof GHReviewThreadCommentSchema>;

function parseTimestamp(value?: string): number | undefined {
	if (!value) {
		return undefined;
	}

	const timestamp = new Date(value).getTime();
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

function sortPullRequestComments(
	comments: PullRequestComment[],
): PullRequestComment[] {
	return comments.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function getReviewThreadCommentId(
	comment: ReviewThreadCommentNode,
): string | null {
	if (typeof comment.databaseId === "number") {
		return `review-${comment.databaseId}`;
	}

	return comment.id ? `review-node-${comment.id}` : null;
}

function parseReviewThreadCommentNode({
	comment,
	isResolved,
}: {
	comment: ReviewThreadCommentNode;
	isResolved: boolean;
}): PullRequestComment | null {
	const id = getReviewThreadCommentId(comment);
	const body = comment.body?.trim();
	if (!id || !body) {
		return null;
	}

	return {
		id,
		authorLogin: comment.author?.login || "github",
		...(comment.author?.avatarUrl
			? { avatarUrl: comment.author.avatarUrl }
			: {}),
		body,
		createdAt: parseTimestamp(comment.createdAt),
		url: comment.url,
		kind: "review" as const,
		path: comment.path,
		line: comment.line ?? comment.originalLine ?? undefined,
		isResolved,
	};
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

export function parseReviewThreadCommentsConnection({
	comments,
	isResolved,
}: {
	comments: unknown;
	isResolved: boolean;
}): PullRequestComment[] {
	const parsed = GHReviewThreadCommentsConnectionSchema.safeParse(comments);
	if (!parsed.success) {
		return [];
	}

	return (
		parsed.data.nodes?.flatMap((comment) => {
			if (!comment) {
				return [];
			}

			const parsedComment = parseReviewThreadCommentNode({
				comment,
				isResolved,
			});
			return parsedComment ? [parsedComment] : [];
		}) ?? []
	);
}

export function parseReviewThreadCommentsResponse(
	raw: unknown[],
): PullRequestComment[] {
	return sortPullRequestComments(
		raw.flatMap((item) => {
			const result = GHReviewThreadSchema.safeParse(item);
			if (!result.success) {
				return [];
			}

			return parseReviewThreadCommentsConnection({
				comments: result.data.comments,
				isResolved: result.data.isResolved === true,
			});
		}),
	);
}

export function parseConversationCommentsResponse(
	raw: unknown[],
): PullRequestComment[] {
	return sortPullRequestComments(
		raw.flatMap((item) => {
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
		}),
	);
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

	return sortPullRequestComments([...commentsById.values()]);
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

function parseJsonOrNull({
	stdout,
	errorLabel,
	context,
}: {
	stdout: string;
	errorLabel: string;
	context?: Record<string, unknown>;
}): unknown | null {
	try {
		return JSON.parse(stdout.trim());
	} catch (error) {
		console.warn(errorLabel, {
			error,
			stdout,
			...context,
		});
		return null;
	}
}

async function fetchAdditionalReviewThreadCommentsForThread({
	worktreePath,
	threadId,
	initialAfterCursor,
	isResolved,
}: {
	worktreePath: string;
	threadId: string;
	initialAfterCursor: string;
	isResolved: boolean;
}): Promise<PullRequestComment[]> {
	const reviewComments: PullRequestComment[] = [];
	let afterCursor: string | null = initialAfterCursor;

	while (afterCursor) {
		let stdout: string;
		try {
			const result = await execWithShellEnv(
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
			stdout = result.stdout;
		} catch (error) {
			console.warn(
				"[GitHub] Failed to fetch additional pull request review thread comments:",
				{
					error,
					threadId,
					worktreePath,
					afterCursor,
				},
			);
			return reviewComments;
		}
		const raw = parseJsonOrNull({
			stdout,
			errorLabel:
				"[GitHub] Failed to parse pull request review thread comments JSON response:",
			context: { threadId, worktreePath },
		});
		if (raw === null) {
			return reviewComments;
		}

		const parsed = GHReviewThreadCommentsResponseSchema.safeParse(raw);
		if (!parsed.success) {
			console.warn(
				"[GitHub] Failed to parse pull request review thread comments response:",
				parsed.error.message,
			);
			return reviewComments;
		}

		const comments = parsed.data.data.node?.comments;
		if (!comments) {
			return reviewComments;
		}

		reviewComments.push(
			...parseReviewThreadCommentsConnection({
				comments,
				isResolved,
			}),
		);
		afterCursor =
			comments.pageInfo.hasNextPage && comments.pageInfo.endCursor
				? comments.pageInfo.endCursor
				: null;
	}

	return reviewComments;
}

async function fetchReviewThreadCommentsForPullRequest(
	worktreePath: string,
	repoNameWithOwner: string,
	pullRequestNumber: number,
): Promise<PullRequestComment[]> {
	const [owner, name] = repoNameWithOwner.split("/");
	if (!owner || !name) {
		return [];
	}

	const reviewComments: PullRequestComment[] = [];
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

		let stdout: string;
		try {
			const result = await execWithShellEnv("gh", args, {
				cwd: worktreePath,
			});
			stdout = result.stdout;
		} catch (error) {
			console.warn("[GitHub] Failed to fetch pull request review threads:", {
				error,
				owner,
				name,
				pullRequestNumber,
				worktreePath,
				afterCursor,
			});
			return sortPullRequestComments(reviewComments);
		}
		const raw = parseJsonOrNull({
			stdout,
			errorLabel:
				"[GitHub] Failed to parse pull request review threads JSON response:",
			context: { owner, name, pullRequestNumber, worktreePath },
		});
		if (raw === null) {
			return sortPullRequestComments(reviewComments);
		}

		const parsed = GHReviewThreadsResponseSchema.safeParse(raw);
		if (!parsed.success) {
			console.warn(
				"[GitHub] Failed to parse pull request review threads response:",
				parsed.error.message,
			);
			return sortPullRequestComments(reviewComments);
		}

		const reviewThreads =
			parsed.data.data.repository?.pullRequest?.reviewThreads ?? null;
		if (!reviewThreads) {
			return sortPullRequestComments(reviewComments);
		}

		for (const thread of reviewThreads.nodes ?? []) {
			if (!thread) {
				continue;
			}

			const isResolved = thread.isResolved === true;
			reviewComments.push(
				...parseReviewThreadCommentsConnection({
					comments: thread.comments,
					isResolved,
				}),
			);

			if (
				thread.id &&
				thread.comments?.pageInfo.hasNextPage &&
				thread.comments.pageInfo.endCursor
			) {
				reviewComments.push(
					...(await fetchAdditionalReviewThreadCommentsForThread({
						worktreePath,
						threadId: thread.id,
						initialAfterCursor: thread.comments.pageInfo.endCursor,
						isResolved,
					})),
				);
			}
		}

		if (
			!reviewThreads.pageInfo.hasNextPage ||
			!reviewThreads.pageInfo.endCursor
		) {
			return sortPullRequestComments(reviewComments);
		}

		afterCursor = reviewThreads.pageInfo.endCursor;
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
	const [reviewThreadsResult, conversationResult] = await Promise.allSettled([
		fetchReviewThreadCommentsForPullRequest(
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

	const reviewComments =
		reviewThreadsResult.status === "fulfilled" ? reviewThreadsResult.value : [];
	const conversationComments =
		conversationResult.status === "fulfilled" ? conversationResult.value : [];

	if (reviewThreadsResult.status === "rejected") {
		console.warn(
			"[GitHub] Failed to fetch pull request review threads:",
			reviewThreadsResult.reason,
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
