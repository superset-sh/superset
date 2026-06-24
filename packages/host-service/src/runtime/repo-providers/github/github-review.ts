import type { Octokit } from "@octokit/rest";
import type {
	IssueComment,
	PullRequestReviewThread,
} from "../../../trpc/router/git/types";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "../../../trpc/router/git/utils/graphql";
import type { RepoRef } from "../types";

interface GitHubReviewDeps {
	github: () => Promise<Octokit>;
}

export async function fetchReviewThreadsGitHub(
	deps: GitHubReviewDeps,
	repo: RepoRef,
	prNumber: number,
): Promise<{
	reviewThreads: PullRequestReviewThread[];
	conversationComments: IssueComment[];
}> {
	const octokit = await deps.github();

	let reviewThreads: PullRequestReviewThread[] = [];
	try {
		const result: GraphQLThreadsResult = await octokit.graphql(
			REVIEW_THREADS_QUERY,
			{
				owner: repo.owner,
				name: repo.name,
				prNumber,
			},
		);
		reviewThreads = parseGraphQLThreads(result);
	} catch (error) {
		console.warn(
			"[git.getPullRequestThreads] Failed to fetch review threads:",
			error,
		);
	}

	const conversationComments: IssueComment[] = [];
	try {
		let page = 1;
		let hasMore = true;
		while (hasMore) {
			const { data: comments } = await octokit.issues.listComments({
				owner: repo.owner,
				repo: repo.name,
				issue_number: prNumber,
				per_page: 100,
				page,
			});
			for (const c of comments) {
				const body = c.body?.trim();
				if (!body) continue;
				conversationComments.push({
					id: c.id,
					user: {
						login: c.user?.login ?? "ghost",
						avatarUrl: c.user?.avatar_url ?? "",
					},
					body,
					createdAt: c.created_at ?? "",
					htmlUrl: c.html_url ?? "",
				});
			}
			hasMore = comments.length === 100;
			page++;
		}
	} catch (error) {
		console.warn(
			"[git.getPullRequestThreads] Failed to fetch conversation comments:",
			error,
		);
	}

	return { reviewThreads, conversationComments };
}

export async function setReviewThreadResolutionGitHub(
	deps: GitHubReviewDeps,
	threadId: string,
	resolved: boolean,
): Promise<void> {
	const octokit = await deps.github();
	const mutation = resolved
		? `mutation($threadId: ID!) {
			resolveReviewThread(input: {threadId: $threadId}) {
				thread { id isResolved }
			}
		}`
		: `mutation($threadId: ID!) {
			unresolveReviewThread(input: {threadId: $threadId}) {
				thread { id isResolved }
			}
		}`;

	await octokit.graphql(mutation, { threadId });
}
