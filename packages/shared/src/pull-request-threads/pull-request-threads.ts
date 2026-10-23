/** GitHub GraphQL: DiffSide */
export type DiffSide = "LEFT" | "RIGHT";

export interface PullRequestReviewComment {
	id: string;
	databaseId: number;
	author: { login: string; avatarUrl: string };
	body: string;
	createdAt: string;
}

export interface PullRequestReviewThread {
	id: string;
	isResolved: boolean;
	isOutdated: boolean;
	diffSide: DiffSide;
	line: number | null;
	path: string;
	comments: PullRequestReviewComment[];
}

export const REVIEW_THREADS_QUERY = `
	query($owner: String!, $name: String!, $prNumber: Int!) {
		repository(owner: $owner, name: $name) {
			pullRequest(number: $prNumber) {
				reviewThreads(first: 100) {
					nodes {
						id
						isResolved
						diffSide
						comments(first: 100) {
							nodes {
								id
								databaseId
								author { login avatarUrl }
								body
								createdAt
								path
								line
								originalLine
							}
						}
					}
				}
			}
		}
	}
`;

export interface ReviewThreadsQueryResult {
	repository: {
		pullRequest: {
			reviewThreads: {
				nodes: Array<{
					id: string;
					isResolved: boolean;
					diffSide: string;
					comments: {
						nodes: Array<{
							id: string;
							databaseId: number;
							author: { login: string; avatarUrl: string } | null;
							body: string;
							createdAt: string;
							path: string;
							line: number | null;
							originalLine: number | null;
						}>;
					};
				}>;
			};
		};
	};
}

export function parseReviewThreads(
	result: ReviewThreadsQueryResult,
): PullRequestReviewThread[] {
	return result.repository.pullRequest.reviewThreads.nodes.map((thread) => {
		const firstComment = thread.comments.nodes[0];
		// GitHub clears `line` (keeping only `originalLine`) when a thread's
		// anchor moved or was rewritten in a later commit — that's the
		// "Outdated" signal in the Files Changed view.
		const isOutdated =
			firstComment?.line == null && firstComment?.originalLine != null;
		return {
			id: thread.id,
			isResolved: thread.isResolved,
			isOutdated,
			diffSide: thread.diffSide === "LEFT" ? "LEFT" : "RIGHT",
			line: firstComment?.line ?? firstComment?.originalLine ?? null,
			path: firstComment?.path ?? "",
			comments: thread.comments.nodes.map(
				(comment): PullRequestReviewComment => ({
					id: comment.id,
					databaseId: comment.databaseId,
					author: comment.author ?? { login: "ghost", avatarUrl: "" },
					body: comment.body,
					createdAt: comment.createdAt,
				}),
			),
		};
	});
}
