import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const execFileAsync = promisify(execFile);

/**
 * Checks if an error message indicates the upstream branch is missing.
 * This happens when:
 * - The remote branch was deleted (e.g., after PR merge)
 * - No tracking branch is configured
 */
export function isUpstreamMissingError(message: string): boolean {
	return (
		message.includes("no such ref was fetched") ||
		message.includes("no tracking information") ||
		message.includes("couldn't find remote ref")
	);
}

export const createGitOperationsRouter = () => {
	return router({
		saveFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					content: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const fullPath = join(input.worktreePath, input.filePath);
				await writeFile(fullPath, input.content, "utf-8");
				return { success: true };
			}),

		commit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
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
				const git = simpleGit(input.worktreePath);
				if (input.setUpstream) {
					const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
					await git.push(["--set-upstream", "origin", branch.trim()]);
				} else {
					await git.push();
				}
				return { success: true };
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				try {
					await git.pull();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					// If upstream doesn't exist, provide a clearer error
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
				const git = simpleGit(input.worktreePath);
				// Try to pull first, but handle case where upstream doesn't exist
				try {
					await git.pull();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					// If upstream doesn't exist, skip pull and just push
					if (isUpstreamMissingError(message)) {
						// Just push instead
						const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
						await git.push(["--set-upstream", "origin", branch.trim()]);
						return { success: true };
					}
					throw error;
				}
				await git.push();
				return { success: true };
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					title: z.string(),
					body: z.string().optional(),
					draft: z.boolean().optional(),
				}),
			)
			.mutation(
				async ({
					input,
				}): Promise<{ success: boolean; url: string; number: number }> => {
					const args = [
						"pr",
						"create",
						"--title",
						input.title,
						"--json",
						"url,number",
					];
					if (input.body) {
						args.push("--body", input.body);
					}
					if (input.draft) {
						args.push("--draft");
					}

					const { stdout } = await execFileAsync("gh", args, {
						cwd: input.worktreePath,
					});
					const result = JSON.parse(stdout);
					return {
						success: true,
						url: result.url,
						number: result.number,
					};
				},
			),
	});
};
