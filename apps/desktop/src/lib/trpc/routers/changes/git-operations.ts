import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getCurrentBranch } from "../workspaces/utils/git";
import { getSimpleGitWithShellPath } from "../workspaces/utils/git-client";
import {
	isNoPullRequestFoundMessage,
	isUpstreamMissingError,
} from "./git-utils";
import { assertRegisteredWorktree } from "./security/path-validation";
import {
	fetchCurrentBranch,
	getTrackingBranchStatus,
	hasUpstreamBranch,
	isNonFastForwardPushError,
	pushCurrentBranch,
	pushWithResolvedUpstream,
} from "./utils/git-push";
import { mergePullRequest } from "./utils/merge-pull-request";
import {
	buildNewPullRequestUrl,
	findExistingOpenPRUrl,
} from "./utils/pull-request-discovery";
import { clearStatusCacheForWorktree } from "./utils/status-cache";
import { clearWorktreeStatusCaches } from "./utils/worktree-status-caches";

export { isUpstreamMissingError };

async function getGitWithShellPath(worktreePath: string) {
	return getSimpleGitWithShellPath(worktreePath);
}

async function getLocalBranchOrThrow({
	worktreePath,
	action,
}: {
	worktreePath: string;
	action: string;
}): Promise<string> {
	const branch = await getCurrentBranch(worktreePath);
	if (!branch) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Cannot ${action} from detached HEAD. Please checkout a branch and try again.`,
		});
	}
	return branch;
}

export const createGitOperationsRouter = () => {
	return router({
		// NOTE: saveFile is defined in file-contents.ts with hardened path validation
		// Do NOT add saveFile here - it would overwrite the secure version

		commit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = await getGitWithShellPath(input.worktreePath);
					const result = await git.commit(input.message);
					clearStatusCacheForWorktree(input.worktreePath);
					return { success: true, hash: result.commit };
				},
			),

		push: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					setUpstream: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = await getGitWithShellPath(input.worktreePath);
				const hasUpstream = await hasUpstreamBranch(git);
				const localBranch = await getLocalBranchOrThrow({
					worktreePath: input.worktreePath,
					action: "push",
				});

				if (input.setUpstream && !hasUpstream) {
					await pushWithResolvedUpstream({
						git,
						worktreePath: input.worktreePath,
						localBranch,
					});
				} else {
					await pushCurrentBranch({
						git,
						worktreePath: input.worktreePath,
						localBranch,
					});
				}

				await fetchCurrentBranch(git, input.worktreePath);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = await getGitWithShellPath(input.worktreePath);
				try {
					await git.pull(["--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						throw new Error(
							"No upstream branch to pull from. The remote branch may have been deleted.",
						);
					}
					throw error;
				}
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		sync: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = await getGitWithShellPath(input.worktreePath);
				try {
					await git.pull(["--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						const localBranch = await getLocalBranchOrThrow({
							worktreePath: input.worktreePath,
							action: "push",
						});
						await pushWithResolvedUpstream({
							git,
							worktreePath: input.worktreePath,
							localBranch,
						});
						await fetchCurrentBranch(git, input.worktreePath);
						clearStatusCacheForWorktree(input.worktreePath);
						return { success: true };
					}
					throw error;
				}

				const localBranch = await getLocalBranchOrThrow({
					worktreePath: input.worktreePath,
					action: "push",
				});
				await pushCurrentBranch({
					git,
					worktreePath: input.worktreePath,
					localBranch,
				});
				await fetchCurrentBranch(git, input.worktreePath);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		fetch: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);
				const git = await getGitWithShellPath(input.worktreePath);
				await fetchCurrentBranch(git, input.worktreePath);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					allowOutOfDate: z.boolean().optional().default(false),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; url: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = await getGitWithShellPath(input.worktreePath);
					const branch = await getLocalBranchOrThrow({
						worktreePath: input.worktreePath,
						action: "create a pull request",
					});

					const trackingStatus = await getTrackingBranchStatus(git);
					const hasUpstream = trackingStatus.hasUpstream;
					const isBehindUpstream =
						trackingStatus.hasUpstream && trackingStatus.pullCount > 0;
					const hasUnpushedCommits =
						trackingStatus.hasUpstream && trackingStatus.pushCount > 0;

					if (isBehindUpstream && !input.allowOutOfDate) {
						const commitLabel =
							trackingStatus.pullCount === 1 ? "commit" : "commits";
						throw new TRPCError({
							code: "PRECONDITION_FAILED",
							message: `Branch is behind upstream by ${trackingStatus.pullCount} ${commitLabel}. Pull/rebase first, or continue anyway.`,
						});
					}

					// Ensure remote branch exists and local commits are available on remote before PR create.
					if (!hasUpstream) {
						await pushWithResolvedUpstream({
							git,
							worktreePath: input.worktreePath,
							localBranch: branch,
						});
					} else {
						try {
							await pushCurrentBranch({
								git,
								worktreePath: input.worktreePath,
								localBranch: branch,
							});
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error);
							if (
								input.allowOutOfDate &&
								isBehindUpstream &&
								hasUnpushedCommits &&
								isNonFastForwardPushError(message)
							) {
								throw new TRPCError({
									code: "PRECONDITION_FAILED",
									message:
										"Branch has local commits but is behind upstream. Pull/rebase first so local commits can be pushed before creating a PR.",
								});
							}
							throw error;
						}
					}

					const existingPRUrl = await findExistingOpenPRUrl(input.worktreePath);
					if (existingPRUrl) {
						await fetchCurrentBranch(git, input.worktreePath);
						clearWorktreeStatusCaches(input.worktreePath);
						return { success: true, url: existingPRUrl };
					}

					try {
						const url = await buildNewPullRequestUrl(
							input.worktreePath,
							git,
							branch,
						);
						await fetchCurrentBranch(git, input.worktreePath);
						clearWorktreeStatusCaches(input.worktreePath);

						return { success: true, url };
					} catch (error) {
						// If creation reports branch/tracking mismatch but an open PR exists,
						// recover by opening that existing PR instead of failing.
						const recoveredPRUrl = await findExistingOpenPRUrl(
							input.worktreePath,
						);
						if (recoveredPRUrl) {
							await fetchCurrentBranch(git, input.worktreePath);
							clearWorktreeStatusCaches(input.worktreePath);
							return { success: true, url: recoveredPRUrl };
						}
						throw error;
					}
				},
			),

		mergePR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					strategy: z.enum(["merge", "squash", "rebase"]).default("squash"),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; mergedAt?: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					try {
						return await mergePullRequest(input);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("[git/mergePR] Failed to merge PR:", message);

						if (isNoPullRequestFoundMessage(message)) {
							throw new TRPCError({
								code: "NOT_FOUND",
								message: "No pull request found for this branch",
							});
						}
						if (
							message === "PR is already merged" ||
							message === "PR is closed and cannot be merged"
						) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message,
							});
						}
						if (
							message.includes("not mergeable") ||
							message.includes("blocked")
						) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message:
									"PR cannot be merged. Check for merge conflicts or required status checks.",
							});
						}
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: `Failed to merge PR: ${message}`,
						});
					}
				},
			),
	});
};
