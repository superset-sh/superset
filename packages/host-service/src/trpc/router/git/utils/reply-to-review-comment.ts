import type { Octokit } from "@octokit/rest";
import { actionRejectionError } from "../../github/github";

export interface ReplyToReviewCommentInput {
	owner: string;
	repo: string;
	prNumber: number;
	/** REST databaseId of any comment already in the thread — GitHub's
	 *  reply endpoint threads the new comment onto it regardless of which
	 *  comment in the thread you target. */
	commentId: number;
	body: string;
}

/**
 * Posts a reply into an existing review thread on GitHub.
 *
 * Shared by pullRequests.replyToThread (project + PR number scoped) and
 * git.replyToReviewThread (workspace scoped): the two differ only in how
 * they find the repo and PR, not in what they send.
 */
export async function replyToReviewComment(
	octokit: Pick<Octokit, "pulls">,
	input: ReplyToReviewCommentInput,
): Promise<{ id: number }> {
	try {
		const { data } = await octokit.pulls.createReplyForReviewComment({
			owner: input.owner,
			repo: input.repo,
			pull_number: input.prNumber,
			comment_id: input.commentId,
			body: input.body,
		});
		return { id: data.id };
	} catch (error) {
		throw actionRejectionError(error, "GitHub refused the reply.");
	}
}
