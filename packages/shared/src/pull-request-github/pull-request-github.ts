import {
	type PullRequestDetailRead,
	PullRequestReadError,
	pullRequestNodeId,
	readPullRequestDetail,
} from "../pull-request-detail";
import {
	fetchPullRequestFilesDiff,
	isPullRequestDiffTooLarge,
	type PullRequestDiff,
} from "../pull-request-diff";
import {
	type PullRequestReviewThread,
	parseReviewThreads,
	REVIEW_THREADS_QUERY,
	type ReviewThreadsQueryResult,
} from "../pull-request-threads";

/**
 * GitHub authenticated as one person. The API builds it from their OAuth
 * connection, the desktop from the `gh` login on their own machine; the
 * pull request code below is the same for both.
 */
export interface GithubClient {
	graphql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
	request: (
		route: string,
		parameters?: Record<string, unknown>,
	) => Promise<{ data: unknown }>;
}

export interface GithubPullRequestRef {
	owner: string;
	repo: string;
	number: number;
}

export type PullRequestMergeMethod = "merge" | "squash" | "rebase";

export interface PullRequestThreads {
	reviewThreads: PullRequestReviewThread[];
	/** True when GitHub failed the read; an empty list then means "unknown", not "none". */
	fetchFailed: boolean;
}

function field<T>(data: unknown, key: string): T | undefined {
	return data && typeof data === "object"
		? ((data as Record<string, unknown>)[key] as T | undefined)
		: undefined;
}

export function pullRequestOnGithub(
	client: GithubClient,
	pr: GithubPullRequestRef,
) {
	const rest = { owner: pr.owner, repo: pr.repo, pull_number: pr.number };
	const ref = { owner: pr.owner, repo: pr.repo, pullNumber: pr.number };
	const graphql = { graphql: client.graphql };

	return {
		detail: (
			options: { activity?: boolean } = {},
		): Promise<PullRequestDetailRead> =>
			readPullRequestDetail(
				{
					...graphql,
					requestedReviewers: async () => {
						const { data } = await client.request(
							"GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers",
							rest,
						);
						return {
							users: field(data, "users") ?? [],
							teams: field(data, "teams") ?? [],
						};
					},
				},
				ref,
				options,
			),

		threads: async (): Promise<PullRequestThreads> => {
			try {
				const result = await client.graphql<ReviewThreadsQueryResult>(
					REVIEW_THREADS_QUERY,
					{ owner: pr.owner, name: pr.repo, prNumber: pr.number },
				);
				return {
					reviewThreads: parseReviewThreads(result),
					fetchFailed: false,
				};
			} catch {
				// Empty rather than an error, so the diff still shows when only
				// its comments failed.
				return { reviewThreads: [], fetchFailed: true };
			}
		},

		diff: async (): Promise<PullRequestDiff> => {
			let data: unknown;
			try {
				({ data } = await client.request(
					"GET /repos/{owner}/{repo}/pulls/{pull_number}",
					{ ...rest, headers: { accept: "application/vnd.github.diff" } },
				));
			} catch (error) {
				if (!isPullRequestDiffTooLarge(error)) throw error;
				return fetchPullRequestFilesDiff({
					readPullRequest: async () =>
						(
							await client.request(
								"GET /repos/{owner}/{repo}/pulls/{pull_number}",
								rest,
							)
						).data,
					readFiles: async (page, perPage) =>
						(
							await client.request(
								"GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
								{ ...rest, page, per_page: perPage },
							)
						).data,
				});
			}
			if (typeof data !== "string") {
				throw new Error("GitHub did not return a pull request diff");
			}
			return { patch: data };
		},

		comment: async (body: string) => {
			const { data } = await client.request(
				"POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
				{ owner: pr.owner, repo: pr.repo, issue_number: pr.number, body },
			);
			return {
				id: field<number>(data, "id"),
				url: field<string>(data, "html_url"),
			};
		},

		/** `commentId`: REST databaseId of any comment already in the thread. */
		reply: async (commentId: number, body: string) => {
			const { data } = await client.request(
				"POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
				{ ...rest, comment_id: commentId, body },
			);
			return { id: field<number>(data, "id") };
		},

		resolveThread: async (threadId: string, resolved: boolean) => {
			const verb = resolved ? "resolveReviewThread" : "unresolveReviewThread";
			await client.graphql(
				`mutation($threadId: ID!) { ${verb}(input: {threadId: $threadId}) { thread { id } } }`,
				{ threadId },
			);
			return { threadId, isResolved: resolved };
		},

		merge: async (merge: {
			mergeMethod: PullRequestMergeMethod;
			commitMessage?: string;
		}) => {
			const { data } = await client.request(
				"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
				{
					...rest,
					merge_method: merge.mergeMethod,
					...(merge.commitMessage
						? { commit_message: merge.commitMessage }
						: {}),
				},
			);
			return {
				merged: field<boolean>(data, "merged") ?? false,
				sha: field<string>(data, "sha") ?? null,
			};
		},

		/** Only open/closed: a merged pull request has no way back. */
		setState: async (state: "open" | "closed") => {
			await client.request("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", {
				...rest,
				state,
			});
		},

		setDraft: async (draft: boolean) => {
			const id = await pullRequestNodeId(graphql, ref);
			const mutation = draft
				? "convertPullRequestToDraft"
				: "markPullRequestReadyForReview";
			await client.graphql(
				`mutation($id: ID!) { ${mutation}(input: {pullRequestId: $id}) { pullRequest { isDraft } } }`,
				{ id },
			);
		},

		updateBranch: async () => {
			await client.request(
				"PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch",
				rest,
			);
		},

		dequeue: async () => {
			const id = await pullRequestNodeId(graphql, ref);
			await client.graphql(
				"mutation($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { position } } }",
				{ id },
			);
		},
	};
}

export type PullRequestOnGithub = ReturnType<typeof pullRequestOnGithub>;

export type GithubErrorCode =
	| "NOT_FOUND"
	| "FORBIDDEN"
	| "UNAUTHORIZED"
	| "CONFLICT"
	| "BAD_REQUEST"
	| "INTERNAL_SERVER_ERROR";

/** What GitHub's answer means, as the error code clients branch on. */
export function githubErrorCode(error: unknown): GithubErrorCode {
	if (error instanceof PullRequestReadError) return error.code;
	const status =
		typeof error === "object" && error !== null && "status" in error
			? Number((error as { status: unknown }).status)
			: null;
	// GraphQL rejections arrive as errors in a 200 response — no status, but
	// still the PR's state talking (already merged, not a draft, no access).
	if (
		status === null &&
		typeof error === "object" &&
		error !== null &&
		"errors" in error
	) {
		const errors = (error as { errors: unknown }).errors;
		const types = new Set(
			(Array.isArray(errors) ? errors : []).map(
				(entry: { type?: unknown }) => entry?.type,
			),
		);
		if (types.has("NOT_FOUND")) return "NOT_FOUND";
		if (types.has("FORBIDDEN")) return "FORBIDDEN";
		return "BAD_REQUEST";
	}
	switch (status) {
		// 405 not mergeable (conflicts/draft), 409 head branch moved on.
		case 405:
		case 409:
			return "CONFLICT";
		case 401:
			return "UNAUTHORIZED";
		case 403:
			return "FORBIDDEN";
		case 404:
			return "NOT_FOUND";
		case 422:
			return "BAD_REQUEST";
		default:
			return "INTERNAL_SERVER_ERROR";
	}
}
