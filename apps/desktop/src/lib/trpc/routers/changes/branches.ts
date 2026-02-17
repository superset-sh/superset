import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getCurrentBranch } from "../workspaces/utils/git";
import {
	assertRegisteredWorktree,
	getRegisteredWorktree,
	gitSwitchBranch,
} from "./security";

export const createBranchesRouter = () => {
	return router({
		getBranches: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
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
					assertRegisteredWorktree(input.worktreePath);

					const git = simpleGit(input.worktreePath);

					const branchSummary = await git.branch(["-a"]);
					const currentBranch = await getCurrentBranch(input.worktreePath);

					const gitConfigBase = currentBranch
						? await git
								.raw(["config", `branch.${currentBranch}.base`])
								.catch(() => "")
						: "";

					const localBranches: string[] = [];
					const remote: string[] = [];

					for (const name of Object.keys(branchSummary.branches)) {
						if (name.startsWith("remotes/origin/")) {
							if (name === "remotes/origin/HEAD") continue;
							const remoteName = name.replace("remotes/origin/", "");
							remote.push(remoteName);
						} else {
							localBranches.push(name);
						}
					}

					const local = await getLocalBranchesWithDates(git, localBranches);
					const defaultBranch = await getDefaultBranch(git, remote);
					const checkedOutBranches = await getCheckedOutBranches(
						git,
						input.worktreePath,
					);

					return {
						local,
						remote: remote.sort(),
						defaultBranch,
						checkedOutBranches,
						worktreeBaseBranch: gitConfigBase.trim() || null,
					};
				},
			),

		switchBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const worktree = getRegisteredWorktree(input.worktreePath);
				await gitSwitchBranch(input.worktreePath, input.branch);

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

				return { success: true };
			}),

		updateBaseBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					baseBranch: z.string().nullable(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);
				const currentBranch = await getCurrentBranch(input.worktreePath);
				if (!currentBranch) {
					throw new Error("Could not determine current branch");
				}

				if (input.baseBranch) {
					await git.raw([
						"config",
						`branch.${currentBranch}.base`,
						input.baseBranch,
					]);
				} else {
					await git
						.raw(["config", "--unset", `branch.${currentBranch}.base`])
						.catch(() => {});
				}

				return { success: true };
			}),
	});
};

async function getLocalBranchesWithDates(
	git: ReturnType<typeof simpleGit>,
	localBranches: string[],
): Promise<Array<{ branch: string; lastCommitDate: number }>> {
	try {
		const branchInfo = await git.raw([
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
	git: ReturnType<typeof simpleGit>,
	remoteBranches: string[],
): Promise<string> {
	try {
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
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
	git: ReturnType<typeof simpleGit>,
	currentWorktreePath: string,
): Promise<Record<string, string>> {
	const checkedOutBranches: Record<string, string> = {};

	try {
		const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
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
