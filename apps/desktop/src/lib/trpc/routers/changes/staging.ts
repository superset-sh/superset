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
				try {
					await git.checkout(["--", input.filePath]);
					return { success: true };
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new Error(`Failed to discard changes: ${message}`);
				}
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
				try {
					await rm(fullPath, { recursive: true, force: true });
					return { success: true };
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new Error(`Failed to delete untracked path: ${message}`);
				}
			}),
	});
};
