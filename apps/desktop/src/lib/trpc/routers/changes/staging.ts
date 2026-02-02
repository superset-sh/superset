import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	gitCheckoutFile,
	gitDiscardAllStaged,
	gitDiscardAllUnstaged,
	gitStageAll,
	gitStageFile,
	gitStash,
	gitStashIncludeUntracked,
	gitStashPop,
	gitUnstageAll,
	gitUnstageFile,
	secureFs,
} from "./security";

export const createStagingRouter = () => {
	return router({
		stageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStageFile(input.worktreePath, input.filePath, input.repoPath);
				return { success: true };
			}),

		unstageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitUnstageFile(
					input.worktreePath,
					input.filePath,
					input.repoPath,
				);
				return { success: true };
			}),

		discardChanges: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitCheckoutFile(
					input.worktreePath,
					input.filePath,
					input.repoPath,
				);
				return { success: true };
			}),

		stageAll: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStageAll(input.worktreePath, input.repoPath);
				return { success: true };
			}),

		unstageAll: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitUnstageAll(input.worktreePath, input.repoPath);
				return { success: true };
			}),

		deleteUntracked: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const targetRepoPath = input.repoPath || input.worktreePath;
				// Use nested-repo-aware delete that validates both worktree and nested repo
				await secureFs.deleteInNestedRepo(
					input.worktreePath,
					targetRepoPath,
					input.filePath,
				);
				return { success: true };
			}),

		discardAllUnstaged: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitDiscardAllUnstaged(input.worktreePath, input.repoPath);
				return { success: true };
			}),

		discardAllStaged: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitDiscardAllStaged(input.worktreePath, input.repoPath);
				return { success: true };
			}),

		stash: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStash(input.worktreePath, input.repoPath);
				return { success: true };
			}),

		stashIncludeUntracked: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStashIncludeUntracked(input.worktreePath, input.repoPath);
				return { success: true };
			}),

		stashPop: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStashPop(input.worktreePath, input.repoPath);
				return { success: true };
			}),
	});
};
