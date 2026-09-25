import { TRPCError } from "@trpc/server";
import type { SimpleGitOptions } from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getCurrentBranch } from "../workspaces/utils/git";
import { getSimpleGitWithShellPath } from "../workspaces/utils/git-client";
import { rethrowEnvironmentalGitError } from "../workspaces/utils/git-errors";
import {
	isMergeConflictError,
	isNoPullRequestFoundMessage,
	isUpstreamMissingError,
} from "./git-utils";
import { assertRegisteredWorktree } from "./security/path-validation";
import { rethrowCommitFailure } from "./utils/commit-failure";
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

async function getGitWithShellPath(
	worktreePath: string,
	overrides?: Partial<SimpleGitOptions>,
) {
	return getSimpleGitWithShellPath(worktreePath, overrides);
}

/** Runs a git-backed operation, rethrowing environmental git failures
 * (worktree gone, permission wall, not a repo) as typed non-500 TRPCErrors. */
async function runGitOperation<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		rethrowEnvironmentalGitError(error);
		throw error;
	}
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

type ExpectedGitFailureKind =
	| "MERGE_CONFLICT"
	| "PUSH_REJECTED"
	| "UPSTREAM_MISSING";

function classifyExpectedGitFailure(
	message: string,
): { kind: ExpectedGitFailureKind; message: string } | null {
	if (isMergeConflictError(message)) {
		return { kind: "MERGE_CONFLICT", message };
	}
	if (isNonFastForwardPushError(message)) {
		return { kind: "PUSH_REJECTED", message };
	}
	if (isUpstreamMissingError(message)) {
		return {
			kind: "UPSTREAM_MISSING",
			message:
				"No upstream branch to pull from. The remote branch may have been deleted.",
		};
	}
	return null;
}

// Conflicts, rejected pushes and deleted upstreams live in the user's repo,
// not in our code — surface them as typed non-500s so they aren't reported,
// while genuinely unexpected git failures keep escaping as 500s.
function rethrowClassifiedGitError(error: unknown): never {
	if (error instanceof TRPCError) {
		throw error;
	}
	const message = error instanceof Error ? error.message : String(error);
	const expected = classifyExpectedGitFailure(message);
	if (expected) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: expected.message,
			cause: { kind: expected.kind },
		});
	}
	throw error;
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

					return runGitOperation(async () => {
						// Commits run the user's own hooks, whose output becomes the
						// failure message. Keep git's exit status for the classifier so
						// it never has to read that output.
						let exitCode: number | undefined;
						const git = await getGitWithShellPath(input.worktreePath, {
							errors(error, result) {
								exitCode = result.exitCode;
								return error;
							},
						});

						let result: Awaited<ReturnType<typeof git.commit>>;
						try {
							result = await git.commit(input.message);
						} catch (error) {
							rethrowCommitFailure(error, exitCode);
						}
						clearStatusCacheForWorktree(input.worktreePath);
						return { success: true, hash: result.commit };
					});
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

				return runGitOperation(async () => {
					const git = await getGitWithShellPath(input.worktreePath);
					const hasUpstream = await hasUpstreamBranch(git);
					const localBranch = await getLocalBranchOrThrow({
						worktreePath: input.worktreePath,
						action: "push",
					});

					try {
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
					} catch (error) {
						if (error instanceof TRPCError) {
							throw error;
						}
						// Classify environmental failures first: wrapping them below
						// would hide "not a git repository" behind PRECONDITION_FAILED
						// and strip the cause.kind consumers branch on, because the
						// outer boundary skips values that are already TRPCErrors.
						rethrowEnvironmentalGitError(error);
						// git refuses a push for reasons that live in the user's repo,
						// remote or hooks — a rejected ref, missing credentials, a
						// pre-push hook exiting non-zero. Surface git's own text.
						throw new TRPCError({
							code: "PRECONDITION_FAILED",
							message: error instanceof Error ? error.message : String(error),
							cause: error,
						});
					}

					await fetchCurrentBranch(git, input.worktreePath);
					clearStatusCacheForWorktree(input.worktreePath);
					return { success: true };
				});
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return runGitOperation(async () => {
					const git = await getGitWithShellPath(input.worktreePath);
					try {
						await git.pull(["--rebase"]);
					} catch (error) {
						rethrowClassifiedGitError(error);
					}
					clearStatusCacheForWorktree(input.worktreePath);
					return { success: true };
				});
			}),

		sync: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return runGitOperation(async () => {
					const git = await getGitWithShellPath(input.worktreePath);
					try {
						await git.pull(["--rebase"]);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (!isUpstreamMissingError(message)) {
							rethrowClassifiedGitError(error);
						}
						const localBranch = await getLocalBranchOrThrow({
							worktreePath: input.worktreePath,
							action: "push",
						});
						try {
							await pushWithResolvedUpstream({
								git,
								worktreePath: input.worktreePath,
								localBranch,
							});
						} catch (pushError) {
							rethrowClassifiedGitError(pushError);
						}
						await fetchCurrentBranch(git, input.worktreePath);
						clearStatusCacheForWorktree(input.worktreePath);
						return { success: true };
					}

					const localBranch = await getLocalBranchOrThrow({
						worktreePath: input.worktreePath,
						action: "push",
					});
					try {
						await pushCurrentBranch({
							git,
							worktreePath: input.worktreePath,
							localBranch,
						});
					} catch (error) {
						rethrowClassifiedGitError(error);
					}
					await fetchCurrentBranch(git, input.worktreePath);
					clearStatusCacheForWorktree(input.worktreePath);
					return { success: true };
				});
			}),

		fetch: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);
				return runGitOperation(async () => {
					const git = await getGitWithShellPath(input.worktreePath);
					await fetchCurrentBranch(git, input.worktreePath);
					clearStatusCacheForWorktree(input.worktreePath);
					return { success: true };
				});
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

					return runGitOperation(async () => {
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

						const existingPRUrl = await findExistingOpenPRUrl(
							input.worktreePath,
						);
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
					});
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
