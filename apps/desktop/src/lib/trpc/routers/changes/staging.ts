import { rm } from "node:fs/promises";
import { join } from "node:path";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createStagingRouter = () => {
	return router({
		stageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.add(input.filePath);
				return { success: true };
			}),

		unstageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.reset(["HEAD", "--", input.filePath]);
				return { success: true };
			}),

		discardChanges: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.checkout(["--", input.filePath]);
				return { success: true };
			}),

		stageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.add("-A");
				return { success: true };
			}),

		unstageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.reset(["HEAD"]);
				return { success: true };
			}),

		deleteUntracked: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const fullPath = join(input.worktreePath, input.filePath);
				await rm(fullPath, { recursive: true, force: true });
				return { success: true };
			}),
	});
};
