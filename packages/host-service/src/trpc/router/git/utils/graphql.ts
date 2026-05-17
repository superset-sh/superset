import type {
	DiffSide,
	PullRequestReviewComment,
	PullRequestReviewThread,
} from "../types";

export const REVIEW_THREADS_QUERY = `
	query($owner: String!, $name: String!, $prNumber: Int!) {
		repository(owner: $owner, name: $name) {
			pullRequest(number: $prNumber) {
				reviewThreads(first: 100) {
					nodes {
						id
						isResolved
						isOutdated
						diffSide
						path
						line
						originalLine
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

export interface GraphQLThreadsResult {
	repository: {
		pullRequest: {
			reviewThreads: {
				nodes: Array<{
					id: string;
					isResolved: boolean;
					isOutdated: boolean;
					diffSide: string;
					path: string;
					line: number | null;
					originalLine: number | null;
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

export function parseGraphQLThreads(
	result: GraphQLThreadsResult,
): PullRequestReviewThread[] {
	return result.repository.pullRequest.reviewThreads.nodes.map((thread) => {
		const firstComment = thread.comments.nodes[0];
		return {
			id: thread.id,
			isResolved: thread.isResolved,
			isOutdated: thread.isOutdated,
			diffSide: (thread.diffSide === "LEFT" ? "LEFT" : "RIGHT") as DiffSide,
			// `line` is the current diff anchor. Keep outdated/original-only
			// threads out of diff annotations; they still appear in the sidebar.
			line: thread.line,
			originalLine: thread.originalLine ?? firstComment?.originalLine ?? null,
			path: thread.path || firstComment?.path || "",
			comments: thread.comments.nodes.map(
				(c): PullRequestReviewComment => ({
					id: c.id,
					databaseId: c.databaseId,
					author: c.author ?? { login: "ghost", avatarUrl: "" },
					body: c.body,
					createdAt: c.createdAt,
				}),
			),
		};
	});
}
