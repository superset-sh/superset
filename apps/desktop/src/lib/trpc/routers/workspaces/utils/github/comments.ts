import type { PullRequestComment } from "@superset/local-db";
import { execWithShellEnv } from "../shell-env";
import { GHIssueCommentSchema, GHReviewCommentSchema } from "./types";

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

async function fetchReviewCommentsForPullRequest(
	worktreePath: string,
	repoNameWithOwner: string,
	pullRequestNumber: number,
): Promise<PullRequestComment[]> {
	const pages = await fetchPaginatedCommentsEndpoint(
		worktreePath,
		`repos/${repoNameWithOwner}/pulls/${pullRequestNumber}/comments?per_page=100`,
	);

	return parseReviewCommentsResponse(pages);
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
	const [reviewResult, conversationResult] = await Promise.allSettled([
		fetchReviewCommentsForPullRequest(
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
		reviewResult.status === "fulfilled" ? reviewResult.value : [];
	const conversationComments =
		conversationResult.status === "fulfilled" ? conversationResult.value : [];

	if (reviewResult.status === "rejected") {
		console.warn(
			"[GitHub] Failed to fetch pull request review comments:",
			reviewResult.reason,
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
