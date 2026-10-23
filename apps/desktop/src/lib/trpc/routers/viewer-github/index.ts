import { Octokit } from "@octokit/core";
import { LocalGitCredentialProvider } from "@superset/host-service/git-credentials";
import {
	githubErrorCode,
	type PullRequestOnGithub,
	pullRequestOnGithub,
} from "@superset/shared/pull-request-github";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const pullRequestInput = z.object({
	repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
	number: z.number().int().positive(),
});
const body = z.string().trim().min(1).max(65536);

/**
 * Pull requests as the person at this machine, with their own GitHub login
 * (`GH_TOKEN`, a git credential helper, or `gh`). Never a workspace host's:
 * a cloud sandbox or someone else's machine would act as whoever set it up.
 * The token stays in the main process.
 */
export function createViewerGithubRouter(
	credentials: Pick<
		LocalGitCredentialProvider,
		"getToken"
	> = new LocalGitCredentialProvider(),
	clientFor: (token: string) => Octokit = (token) =>
		new Octokit({ auth: token }),
) {
	async function onGithub<T>(
		input: z.infer<typeof pullRequestInput>,
		fallback: string,
		run: (pr: PullRequestOnGithub) => Promise<T>,
	): Promise<T> {
		const token = await credentials.getToken("github.com");
		if (!token) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "No GitHub login on this machine",
			});
		}
		const octokit = clientFor(token);
		const [owner = "", repo = ""] = input.repoFullName.split("/");
		try {
			return await run(
				pullRequestOnGithub(
					{
						graphql: (query, variables) => octokit.graphql(query, variables),
						request: (route, parameters) => octokit.request(route, parameters),
					},
					{ owner, repo, number: input.number },
				),
			);
		} catch (error) {
			throw new TRPCError({
				code: githubErrorCode(error),
				message:
					error instanceof Error && error.message ? error.message : fallback,
				cause: error,
			});
		}
	}

	return router({
		status: publicProcedure.query(async () => ({
			available: Boolean(await credentials.getToken("github.com")),
		})),

		getPullRequestDetail: publicProcedure
			.input(pullRequestInput.extend({ activity: z.boolean().optional() }))
			.query(({ input }) =>
				onGithub(input, `Failed to read pull request #${input.number}`, (pr) =>
					pr.detail({ activity: input.activity }),
				),
			),

		getPullRequestThreads: publicProcedure
			.input(pullRequestInput)
			.query(({ input }) =>
				onGithub(input, "Failed to read review threads", (pr) => pr.threads()),
			),

		getPullRequestDiff: publicProcedure
			.input(pullRequestInput)
			.query(({ input }) =>
				onGithub(input, "Failed to read the diff", (pr) => pr.diff()),
			),

		addPullRequestComment: publicProcedure
			.input(pullRequestInput.extend({ body }))
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused the comment.", (pr) =>
					pr.comment(input.body),
				),
			),

		replyToPullRequestThread: publicProcedure
			.input(
				pullRequestInput.extend({
					commentId: z.number().int().positive(),
					body,
				}),
			)
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused the reply.", (pr) =>
					pr.reply(input.commentId, input.body),
				),
			),

		setPullRequestThreadResolution: publicProcedure
			.input(
				pullRequestInput.extend({
					threadId: z.string().min(1),
					resolved: z.boolean(),
				}),
			)
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused to update the thread.", (pr) =>
					pr.resolveThread(input.threadId, input.resolved),
				),
			),

		mergePullRequest: publicProcedure
			.input(
				pullRequestInput.extend({
					mergeMethod: z.enum(["merge", "squash", "rebase"]),
					commitMessage: z.string().trim().min(1).optional(),
				}),
			)
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused the merge.", (pr) =>
					pr.merge({
						mergeMethod: input.mergeMethod,
						commitMessage: input.commitMessage,
					}),
				),
			),

		setPullRequestState: publicProcedure
			.input(pullRequestInput.extend({ state: z.enum(["open", "closed"]) }))
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused to change the pull request.", (pr) =>
					pr.setState(input.state),
				),
			),

		setPullRequestDraft: publicProcedure
			.input(pullRequestInput.extend({ draft: z.boolean() }))
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused to change the draft state.", (pr) =>
					pr.setDraft(input.draft),
				),
			),
	});
}
