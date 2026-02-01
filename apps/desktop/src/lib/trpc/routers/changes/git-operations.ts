import { shell } from "electron";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { isUpstreamMissingError } from "./git-utils";
import { assertRegisteredWorktree } from "./security";

export { isUpstreamMissingError };

async function hasUpstreamBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch {
		return false;
	}
}

async function fetchCurrentBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<void> {
	const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
	await git.fetch(["origin", branch]);
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

					const git = simpleGit(input.worktreePath);
					const result = await git.commit(input.message);
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

				const git = simpleGit(input.worktreePath);
				const hasUpstream = await hasUpstreamBranch(git);

				if (input.setUpstream && !hasUpstream) {
					const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
					await git.push(["--set-upstream", "origin", branch.trim()]);
				} else {
					await git.push();
				}
				await fetchCurrentBranch(git);
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

				const git = simpleGit(input.worktreePath);
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

				const git = simpleGit(input.worktreePath);
				try {
					await git.pull(["--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
						await git.push(["--set-upstream", "origin", branch.trim()]);
						await fetchCurrentBranch(git);
						return { success: true };
					}
					throw error;
				}
				await git.push();
				await fetchCurrentBranch(git);
				return { success: true };
			}),

		fetch: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);
				const git = simpleGit(input.worktreePath);
				await fetchCurrentBranch(git);
				return { success: true };
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; url: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = simpleGit(input.worktreePath);
					const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
					const hasUpstream = await hasUpstreamBranch(git);

					// Ensure branch is pushed first
					if (!hasUpstream) {
						await git.push(["--set-upstream", "origin", branch]);
					} else {
						// Push any unpushed commits
						await git.push();
					}

					// Get the remote URL to construct the GitHub compare URL
					const remoteUrl = (await git.remote(["get-url", "origin"])) || "";
					const repoMatch = remoteUrl
						.trim()
						.match(/github\.com[:/](.+?)(?:\.git)?$/);

					if (!repoMatch) {
						throw new Error("Could not determine GitHub repository URL");
					}

					const repo = repoMatch[1].replace(/\.git$/, "");
					const url = `https://github.com/${repo}/compare/${branch}?expand=1`;

					await shell.openExternal(url);
					await fetchCurrentBranch(git);

					return { success: true, url };
				},
			),
	});
};
