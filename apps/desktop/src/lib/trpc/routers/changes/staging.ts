import { z } from "zod";
import { publicProcedure, router } from "../..";
import { parsePortelainStatus } from "../workspaces/utils/git";
import {
	assertRegisteredWorkspacePath,
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
import type { GitRunner } from "./utils/git-runner";
import { resolveGitTarget } from "./utils/git-runner";
import { parseGitStatus } from "./utils/parse-status";

async function getStatusViaRunner(runner: GitRunner) {
	const raw = await runner.raw([
		"--no-optional-locks",
		"status",
		"--porcelain=v1",
		"-b",
		"-z",
		"-uall",
	]);
	return parseGitStatus(parsePortelainStatus(raw));
}

async function getUntrackedFilePaths(
	worktreePath: string,
	runner: GitRunner,
): Promise<string[]> {
	assertRegisteredWorkspacePath(worktreePath);
	const parsed = await getStatusViaRunner(runner);
	return parsed.untracked.map((f) => f.path);
}

async function getStagedNewFilePaths(
	worktreePath: string,
	runner: GitRunner,
): Promise<string[]> {
	assertRegisteredWorkspacePath(worktreePath);
	const parsed = await getStatusViaRunner(runner);
	return parsed.staged.filter((f) => f.status === "added").map((f) => f.path);
}

async function deleteFiles(
	worktreePath: string,
	filePaths: string[],
	runner: GitRunner,
): Promise<void> {
	if (runner.isRemote) {
		// For remote: use git clean for targeted file deletion
		if (filePaths.length > 0) {
			await runner.raw(["clean", "-f", "--", ...filePaths]);
		}
		return;
	}

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
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitStageFile(input.worktreePath, input.filePath, runner);
				return { success: true };
			}),

		unstageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitUnstageFile(input.worktreePath, input.filePath, runner);
				return { success: true };
			}),

		discardChanges: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitCheckoutFile(input.worktreePath, input.filePath, runner);
				return { success: true };
			}),

		stageAll: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitStageAll(input.worktreePath, runner);
				return { success: true };
			}),

		unstageAll: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitUnstageAll(input.worktreePath, runner);
				return { success: true };
			}),

		deleteUntracked: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				if (runner.isRemote) {
					await runner.raw(["clean", "-f", "--", input.filePath]);
				} else {
					await secureFs.delete(input.worktreePath, input.filePath);
				}
				return { success: true };
			}),

		discardAllUnstaged: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				const untrackedFiles = await getUntrackedFilePaths(
					input.worktreePath,
					runner,
				);
				await gitDiscardAllUnstaged(input.worktreePath, runner);
				await deleteFiles(input.worktreePath, untrackedFiles, runner);
				return { success: true };
			}),

		discardAllStaged: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				const stagedNewFiles = await getStagedNewFilePaths(
					input.worktreePath,
					runner,
				);
				await gitDiscardAllStaged(input.worktreePath, runner);
				await deleteFiles(input.worktreePath, stagedNewFiles, runner);
				return { success: true };
			}),

		stash: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitStash(input.worktreePath, runner);
				return { success: true };
			}),

		stashIncludeUntracked: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitStashIncludeUntracked(input.worktreePath, runner);
				return { success: true };
			}),

		stashPop: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await gitStashPop(input.worktreePath, runner);
				return { success: true };
			}),
	});
};
