import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	assertRegisteredWorktree,
	gitCheckoutFile,
	gitDiscardAllStaged,
	gitDiscardAllUnstaged,
	gitStageAll,
	gitStageFile,
	gitStageFiles,
	gitStash,
	gitStashIncludeUntracked,
	gitStashPop,
	gitUnstageAll,
	gitUnstageFile,
	gitUnstageFiles,
	secureFs,
} from "./security";
import { parseGitStatus } from "./utils/parse-status";

async function getUntrackedFilePaths(worktreePath: string): Promise<string[]> {
	assertRegisteredWorktree(worktreePath);
	const git = simpleGit(worktreePath);
	const status = await git.status();
	return parseGitStatus(status).untracked.map((f) => f.path);
}

async function getStagedNewFilePaths(worktreePath: string): Promise<string[]> {
	assertRegisteredWorktree(worktreePath);
	const git = simpleGit(worktreePath);
	const status = await git.status();
	return parseGitStatus(status)
		.staged.filter((f) => f.status === "added")
		.map((f) => f.path);
}

async function deleteFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	await Promise.all(
		filePaths.map((filePath) => secureFs.delete(worktreePath, filePath)),
	);
}

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
				await gitStageFile(input.worktreePath, input.filePath);
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
				await gitUnstageFile(input.worktreePath, input.filePath);
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
				await gitCheckoutFile(input.worktreePath, input.filePath);
				return { success: true };
			}),

		stageFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePaths: z.array(z.string()).min(1),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStageFiles(input.worktreePath, input.filePaths);
				return { success: true };
			}),

		unstageFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePaths: z.array(z.string()).min(1),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitUnstageFiles(input.worktreePath, input.filePaths);
				return { success: true };
			}),

		stageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStageAll(input.worktreePath);
				return { success: true };
			}),

		unstageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitUnstageAll(input.worktreePath);
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
				await secureFs.delete(input.worktreePath, input.filePath);
				return { success: true };
			}),

		discardAllUnstaged: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				// Must capture untracked files before git checkout removes status info
				const untrackedFiles = await getUntrackedFilePaths(input.worktreePath);
				await gitDiscardAllUnstaged(input.worktreePath);
				await deleteFiles(input.worktreePath, untrackedFiles);
				return { success: true };
			}),

		discardAllStaged: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				// Must capture staged new files before reset makes them untracked
				const stagedNewFiles = await getStagedNewFilePaths(input.worktreePath);
				await gitDiscardAllStaged(input.worktreePath);
				await deleteFiles(input.worktreePath, stagedNewFiles);
				return { success: true };
			}),

		stash: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStash(input.worktreePath);
				return { success: true };
			}),

		stashIncludeUntracked: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStashIncludeUntracked(input.worktreePath);
				return { success: true };
			}),

		stashPop: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStashPop(input.worktreePath);
				return { success: true };
			}),
	});
};
