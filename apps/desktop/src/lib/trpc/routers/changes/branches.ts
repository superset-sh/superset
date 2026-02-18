import { workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	assertRegisteredWorkspacePath,
	getRegisteredWorktree,
	gitSwitchBranch,
} from "./security";
import type { GitRunner } from "./utils/git-runner";
import { resolveGitTarget } from "./utils/git-runner";

export const createBranchesRouter = () => {
	return router({
		getBranches: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.query(
				async ({
					input,
				}): Promise<{
					local: Array<{ branch: string; lastCommitDate: number }>;
					remote: string[];
					defaultBranch: string;
					checkedOutBranches: Record<string, string>;
					worktreeBaseBranch: string | null;
				}> => {
					assertRegisteredWorkspacePath(input.worktreePath);

					try {
						const target = resolveGitTarget(
							input.worktreePath,
							input.workspaceId,
						);
						const { runner } = target;

						const currentBranch = await getCurrentBranch(runner);

						const gitConfigBase = currentBranch
							? await runner
									.raw(["config", `branch.${currentBranch}.base`])
									.catch(() => "")
							: "";

						const branchOutput = await runner.raw(["branch", "-a"]);
						const localBranches: string[] = [];
						const remote: string[] = [];

						for (const line of branchOutput.split("\n")) {
							const name = line.replace(/^\*?\s+/, "").trim();
							if (!name) continue;
							if (name.startsWith("remotes/origin/")) {
								if (name === "remotes/origin/HEAD") continue;
								const remoteName = name.replace("remotes/origin/", "");
								remote.push(remoteName);
							} else {
								// Skip detached HEAD indicators
								if (name.startsWith("(HEAD detached")) continue;
								localBranches.push(name);
							}
						}

						const local = await getLocalBranchesWithDates(
							runner,
							localBranches,
						);
						const defaultBranch = await getDefaultBranch(runner, remote);
						const checkedOutBranches = await getCheckedOutBranches(
							runner,
							input.worktreePath,
						);

						return {
							local,
							remote: remote.sort(),
							defaultBranch,
							checkedOutBranches,
							worktreeBaseBranch: gitConfigBase.trim() || null,
						};
					} catch (error) {
						console.error(
							"[getBranches] Failed for",
							input.worktreePath,
							error,
						);
						throw error;
					}
				},
			),

		switchBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					branch: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const target = resolveGitTarget(input.worktreePath, input.workspaceId);

				await gitSwitchBranch(input.worktreePath, input.branch, target.runner);

				if (target.kind === "remote") {
					// Update the workspaces table for remote workspaces
					localDb
						.update(workspaces)
						.set({
							branch: input.branch,
							updatedAt: Date.now(),
						})
						.where(eq(workspaces.id, target.workspaceId))
						.run();
				} else {
					// Update the worktrees table for local workspaces
					try {
						const worktree = getRegisteredWorktree(input.worktreePath);
						const gitStatus = worktree.gitStatus
							? { ...worktree.gitStatus, branch: input.branch }
							: null;

						localDb
							.update(worktrees)
							.set({
								branch: input.branch,
								gitStatus,
							})
							.where(eq(worktrees.path, input.worktreePath))
							.run();
					} catch {
						// Not a worktree entry (e.g. project mainRepoPath) — skip DB update
					}
				}

				return { success: true };
			}),

		updateBaseBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					baseBranch: z.string().nullable(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const target = resolveGitTarget(input.worktreePath, input.workspaceId);
				const { runner } = target;

				const currentBranch = await getCurrentBranch(runner);
				if (!currentBranch) {
					throw new Error("Could not determine current branch");
				}

				if (input.baseBranch) {
					await runner.raw([
						"config",
						`branch.${currentBranch}.base`,
						input.baseBranch,
					]);
				} else {
					await runner
						.raw(["config", "--unset", `branch.${currentBranch}.base`])
						.catch(() => {});
				}

				return { success: true };
			}),
	});
};

async function getCurrentBranch(runner: GitRunner): Promise<string | null> {
	try {
		return (await runner.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
	} catch {
		return null;
	}
}

async function getLocalBranchesWithDates(
	runner: GitRunner,
	localBranches: string[],
): Promise<Array<{ branch: string; lastCommitDate: number }>> {
	try {
		const branchInfo = await runner.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short) %(committerdate:unix)",
			"refs/heads/",
		]);

		const local: Array<{ branch: string; lastCommitDate: number }> = [];
		for (const line of branchInfo.trim().split("\n")) {
			if (!line) continue;
			const lastSpaceIdx = line.lastIndexOf(" ");
			const branch = line.substring(0, lastSpaceIdx);
			const timestamp = Number.parseInt(line.substring(lastSpaceIdx + 1), 10);
			if (localBranches.includes(branch)) {
				local.push({
					branch,
					lastCommitDate: timestamp * 1000,
				});
			}
		}
		return local;
	} catch {
		return localBranches.map((branch) => ({ branch, lastCommitDate: 0 }));
	}
}

async function getDefaultBranch(
	runner: GitRunner,
	remoteBranches: string[],
): Promise<string> {
	try {
		const headRef = await runner.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
		]);
		const match = headRef.match(/refs\/remotes\/origin\/(.+)/);
		if (match) {
			return match[1].trim();
		}
	} catch {
		if (remoteBranches.includes("master") && !remoteBranches.includes("main")) {
			return "master";
		}
	}
	return "main";
}

async function getCheckedOutBranches(
	runner: GitRunner,
	currentWorktreePath: string,
): Promise<Record<string, string>> {
	const checkedOutBranches: Record<string, string> = {};

	try {
		const worktreeList = await runner.raw(["worktree", "list", "--porcelain"]);
		const lines = worktreeList.split("\n");
		let currentPath: string | null = null;

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				currentPath = line.substring(9).trim();
			} else if (line.startsWith("branch ")) {
				const branch = line.substring(7).trim().replace("refs/heads/", "");
				if (currentPath && currentPath !== currentWorktreePath) {
					checkedOutBranches[branch] = currentPath;
				}
			}
		}
	} catch {}

	return checkedOutBranches;
}
