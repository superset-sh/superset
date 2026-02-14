import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { shell } from "electron";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	GIT_TIMEOUT_NETWORK,
	GIT_TIMEOUT_NETWORK_HEAVY,
	wrapTimeoutError,
} from "../workspaces/utils/git-timeouts";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { isUpstreamMissingError } from "./git-utils";
import { assertRegisteredWorktree } from "./security";

const execFileAsync = promisify(execFile);

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

async function fetchCurrentBranch(worktreePath: string): Promise<void> {
	const git = simpleGit(worktreePath);
	const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
	try {
		await execFileAsync(
			"git",
			["-C", worktreePath, "fetch", "origin", branch],
			{ timeout: GIT_TIMEOUT_NETWORK },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isUpstreamMissingError(message)) {
			try {
				await execFileAsync("git", ["-C", worktreePath, "fetch", "origin"], {
					timeout: GIT_TIMEOUT_NETWORK,
				});
			} catch (fallbackError) {
				const fallbackMessage =
					fallbackError instanceof Error
						? fallbackError.message
						: String(fallbackError);
				if (!isUpstreamMissingError(fallbackMessage)) {
					console.error(
						`[git/fetch] failed fallback fetch for branch ${branch}:`,
						fallbackError,
					);
					throw wrapTimeoutError(fallbackError, "Fetch");
				}
			}
			return;
		}
		throw wrapTimeoutError(error, "Fetch");
	}
}

async function pushWithSetUpstream({
	worktreePath,
	branch,
}: {
	worktreePath: string;
	branch: string;
}): Promise<void> {
	const trimmedBranch = branch.trim();
	if (!trimmedBranch || trimmedBranch === "HEAD") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot push from detached HEAD. Please checkout a branch and try again.",
		});
	}

	// Use HEAD refspec to avoid resolving the branch name as a local ref.
	// This is more reliable for worktrees where upstream tracking isn't set yet.
	try {
		await execFileAsync(
			"git",
			[
				"-C",
				worktreePath,
				"push",
				"--set-upstream",
				"origin",
				`HEAD:refs/heads/${trimmedBranch}`,
			],
			{ timeout: GIT_TIMEOUT_NETWORK_HEAVY },
		);
	} catch (error) {
		throw wrapTimeoutError(error, "Push");
	}
}

function shouldRetryPushWithUpstream(message: string): boolean {
	const lowerMessage = message.toLowerCase();
	return (
		lowerMessage.includes("no upstream branch") ||
		lowerMessage.includes("no tracking information") ||
		lowerMessage.includes(
			"upstream branch of your current branch does not match",
		) ||
		lowerMessage.includes("cannot be resolved to branch") ||
		lowerMessage.includes("couldn't find remote ref")
	);
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
					await pushWithSetUpstream({
						worktreePath: input.worktreePath,
						branch,
					});
				} else {
					try {
						await execFileAsync("git", ["-C", input.worktreePath, "push"], {
							timeout: GIT_TIMEOUT_NETWORK_HEAVY,
						});
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (shouldRetryPushWithUpstream(message)) {
							const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
							await pushWithSetUpstream({
								worktreePath: input.worktreePath,
								branch,
							});
						} else {
							throw wrapTimeoutError(error, "Push");
						}
					}
				}
				await fetchCurrentBranch(input.worktreePath);
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

				try {
					await execFileAsync(
						"git",
						["-C", input.worktreePath, "pull", "--rebase"],
						{ timeout: GIT_TIMEOUT_NETWORK_HEAVY },
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						throw new Error(
							"No upstream branch to pull from. The remote branch may have been deleted.",
						);
					}
					throw wrapTimeoutError(error, "Pull");
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
					await execFileAsync(
						"git",
						["-C", input.worktreePath, "pull", "--rebase"],
						{ timeout: GIT_TIMEOUT_NETWORK_HEAVY },
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
						await pushWithSetUpstream({
							worktreePath: input.worktreePath,
							branch,
						});
						await fetchCurrentBranch(input.worktreePath);
						return { success: true };
					}
					throw wrapTimeoutError(error, "Sync");
				}
				try {
					await execFileAsync("git", ["-C", input.worktreePath, "push"], {
						timeout: GIT_TIMEOUT_NETWORK_HEAVY,
					});
				} catch (error) {
					throw wrapTimeoutError(error, "Push");
				}
				await fetchCurrentBranch(input.worktreePath);
				return { success: true };
			}),

		fetch: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);
				await fetchCurrentBranch(input.worktreePath);
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
						await pushWithSetUpstream({
							worktreePath: input.worktreePath,
							branch,
						});
					} else {
						// Push any unpushed commits
						try {
							await execFileAsync("git", ["-C", input.worktreePath, "push"], {
								timeout: GIT_TIMEOUT_NETWORK_HEAVY,
							});
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error);
							if (shouldRetryPushWithUpstream(message)) {
								await pushWithSetUpstream({
									worktreePath: input.worktreePath,
									branch,
								});
							} else {
								throw wrapTimeoutError(error, "Push");
							}
						}
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
					await fetchCurrentBranch(input.worktreePath);

					return { success: true, url };
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

					const args = ["pr", "merge", `--${input.strategy}`];

					try {
						await execWithShellEnv("gh", args, { cwd: input.worktreePath });
						return { success: true, mergedAt: new Date().toISOString() };
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("[git/mergePR] Failed to merge PR:", message);

						if (message.includes("no pull requests found")) {
							throw new TRPCError({
								code: "NOT_FOUND",
								message: "No pull request found for this branch",
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
