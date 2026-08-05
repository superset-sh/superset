import { worktrees } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { pathExistsCached } from "../utils/path-exists-cache";
import {
	setBranchBaseConfig,
	unsetBranchBaseConfig,
} from "../workspaces/utils/base-branch-config";
import { getCurrentBranch, NotGitRepoError } from "../workspaces/utils/git";
import { GitEnvironmentError } from "../workspaces/utils/git-errors";
import { gitSwitchBranch } from "./security/git-commands";
import {
	assertRegisteredWorktree,
	getRegisteredWorktree,
} from "./security/path-validation";
import { getPersistedWorktreeBaseBranch } from "./utils/effective-base-branch";
import { clearStatusCacheForWorktree } from "./utils/status-cache";
import { runGitTask } from "./workers/git-task-runner";

// Bumped by branch/base mutations so a refetch fired right after one can't
// coalesce onto an in-flight getBranches task that read pre-mutation state.
const branchesGeneration = new Map<string, number>();
function bumpBranchesGeneration(worktreePath: string): void {
	branchesGeneration.set(
		worktreePath,
		(branchesGeneration.get(worktreePath) ?? 0) + 1,
	);
}

export const createBranchesRouter = () => {
	return router({
		getBranches: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(
				async ({
					input,
				}): Promise<{
					local: Array<{ branch: string; lastCommitDate: number }>;
					remote: string[];
					defaultBranch: string;
					checkedOutBranches: Record<string, string>;
					worktreeBaseBranch: string | null;
					currentBranch: string | null;
				}> => {
					assertRegisteredWorktree(input.worktreePath);
					if (!pathExistsCached(input.worktreePath)) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: `Worktree no longer exists on disk: ${input.worktreePath}`,
							cause: {
								kind: "WORKTREE_MISSING",
								worktreePath: input.worktreePath,
							},
						});
					}

					try {
						return await runGitTask(
							"getBranches",
							{
								worktreePath: input.worktreePath,
								persistedWorktree: getPersistedWorktreeBaseBranch(
									input.worktreePath,
								),
							},
							{
								dedupeKey: `getBranches:${branchesGeneration.get(input.worktreePath) ?? 0}:${input.worktreePath}`,
								strategy: "coalesce",
								timeoutMs: 30_000,
							},
						);
					} catch (error) {
						if (error instanceof NotGitRepoError) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: error.message,
								cause: { kind: "NOT_GIT_REPO" },
							});
						}
						if (error instanceof GitEnvironmentError) {
							throw new TRPCError({
								code: "PRECONDITION_FAILED",
								message: error.message,
								cause: { kind: "GIT_ENVIRONMENT" },
							});
						}
						throw error;
					}
				},
			),

		switchBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const worktree = getRegisteredWorktree(input.worktreePath);
				await gitSwitchBranch(input.worktreePath, input.branch);

				const gitStatus = worktree.gitStatus
					? { ...worktree.gitStatus, branch: input.branch }
					: null;

				localDb
					.update(worktrees)
					.set({
						branch: input.branch,
						baseBranch: null,
						gitStatus,
					})
					.where(eq(worktrees.path, input.worktreePath))
					.run();

				clearStatusCacheForWorktree(input.worktreePath);
				bumpBranchesGeneration(input.worktreePath);
				return { success: true };
			}),

		updateBaseBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					baseBranch: z.string().nullable(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const currentBranch = await getCurrentBranch(input.worktreePath);
				if (!currentBranch) {
					throw new Error("Could not determine current branch");
				}

				if (input.baseBranch) {
					await setBranchBaseConfig({
						repoPath: input.worktreePath,
						branch: currentBranch,
						compareBaseBranch: input.baseBranch,
						isExplicit: true,
					});
				} else {
					await unsetBranchBaseConfig({
						repoPath: input.worktreePath,
						branch: currentBranch,
					});
				}

				localDb
					.update(worktrees)
					.set({ baseBranch: input.baseBranch })
					.where(eq(worktrees.path, input.worktreePath))
					.run();

				clearStatusCacheForWorktree(input.worktreePath);
				bumpBranchesGeneration(input.worktreePath);
				return { success: true };
			}),
	});
};
