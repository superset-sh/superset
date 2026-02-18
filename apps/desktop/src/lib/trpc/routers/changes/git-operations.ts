import { TRPCError } from "@trpc/server";
import { shell } from "electron";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { isUpstreamMissingError } from "./git-utils";
import { assertRegisteredWorkspacePath } from "./security";
import type { GitRunner } from "./utils/git-runner";
import { resolveGitTarget } from "./utils/git-runner";

export { isUpstreamMissingError };

async function hasUpstreamBranch(runner: GitRunner): Promise<boolean> {
	try {
		await runner.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch {
		return false;
	}
}

async function getCurrentBranch(runner: GitRunner): Promise<string> {
	return (await runner.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}

async function fetchCurrentBranchViaRunner(runner: GitRunner): Promise<void> {
	const branch = await getCurrentBranch(runner);
	try {
		await runner.raw(["fetch", "origin", branch]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isUpstreamMissingError(message)) {
			try {
				await runner.raw(["fetch", "origin"]);
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
					throw fallbackError;
				}
			}
			return;
		}
		throw error;
	}
}

async function pushWithSetUpstreamViaRunner({
	runner,
	branch,
}: {
	runner: GitRunner;
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

	await runner.raw([
		"push",
		"--set-upstream",
		"origin",
		`HEAD:refs/heads/${trimmedBranch}`,
	]);
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
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorkspacePath(input.worktreePath);

					const { runner } = resolveGitTarget(
						input.worktreePath,
						input.workspaceId,
					);

					const output = await runner.raw(["commit", "-m", input.message]);
					// Extract commit hash from output like "[branch abc1234] message"
					const hashMatch = output.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
					return {
						success: true,
						hash: hashMatch?.[1] ?? "",
					};
				},
			),

		push: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					setUpstream: z.boolean().optional(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);

				const upstream = await hasUpstreamBranch(runner);

				if (input.setUpstream && !upstream) {
					const branch = await getCurrentBranch(runner);
					await pushWithSetUpstreamViaRunner({ runner, branch });
				} else {
					try {
						await runner.raw(["push"]);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (shouldRetryPushWithUpstream(message)) {
							const branch = await getCurrentBranch(runner);
							await pushWithSetUpstreamViaRunner({ runner, branch });
						} else {
							throw error;
						}
					}
				}
				await fetchCurrentBranchViaRunner(runner);
				return { success: true };
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);

				try {
					await runner.raw(["pull", "--rebase"]);
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
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);

				try {
					await runner.raw(["pull", "--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						const branch = await getCurrentBranch(runner);
						await pushWithSetUpstreamViaRunner({ runner, branch });
						await fetchCurrentBranchViaRunner(runner);
						return { success: true };
					}
					throw error;
				}
				await runner.raw(["push"]);
				await fetchCurrentBranchViaRunner(runner);
				return { success: true };
			}),

		fetch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorkspacePath(input.worktreePath);
				const { runner } = resolveGitTarget(
					input.worktreePath,
					input.workspaceId,
				);
				await fetchCurrentBranchViaRunner(runner);
				return { success: true };
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; url: string }> => {
					assertRegisteredWorkspacePath(input.worktreePath);

					const { runner } = resolveGitTarget(
						input.worktreePath,
						input.workspaceId,
					);

					const branch = await getCurrentBranch(runner);
					const upstream = await hasUpstreamBranch(runner);

					if (!upstream) {
						await pushWithSetUpstreamViaRunner({ runner, branch });
					} else {
						try {
							await runner.raw(["push"]);
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error);
							if (shouldRetryPushWithUpstream(message)) {
								await pushWithSetUpstreamViaRunner({ runner, branch });
							} else {
								throw error;
							}
						}
					}

					const remoteUrl = (
						await runner.raw(["remote", "get-url", "origin"])
					).trim();
					const repoMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);

					if (!repoMatch) {
						throw new Error("Could not determine GitHub repository URL");
					}

					const repo = repoMatch[1].replace(/\.git$/, "");
					const url = `https://github.com/${repo}/compare/${branch}?expand=1`;

					await shell.openExternal(url);
					await fetchCurrentBranchViaRunner(runner);

					return { success: true, url };
				},
			),

		mergePR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					strategy: z.enum(["merge", "squash", "rebase"]).default("squash"),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; mergedAt?: string }> => {
					assertRegisteredWorkspacePath(input.worktreePath);

					const target = resolveGitTarget(
						input.worktreePath,
						input.workspaceId,
					);

					const args = ["pr", "merge", `--${input.strategy}`];

					try {
						if (target.kind === "remote") {
							// For remote: run gh via SSH exec
							const result = await target.runner.exec(`gh ${args.join(" ")}`);
							if (result.code !== 0) {
								throw new Error(result.stderr || "gh pr merge failed");
							}
						} else {
							await execWithShellEnv("gh", args, {
								cwd: input.worktreePath,
							});
						}
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
