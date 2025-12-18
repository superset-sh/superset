import { db } from "main/lib/db";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";

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
				}> => {
					const git = simpleGit(input.worktreePath);

					const branchSummary = await git.branch(["-a"]);

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
				const git = simpleGit(input.worktreePath);

				const worktree = db.data.worktrees.find(
					(wt) => wt.path === input.worktreePath,
				);
				if (!worktree) {
					throw new Error(`No worktree found at path "${input.worktreePath}"`);
				}

				const originalBranch = await getCurrentBranch(git, worktree.branch);

				try {
					await git.checkout(input.branch);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new Error(`Git checkout failed: ${message}`);
				}

				try {
					await db.update((data) => {
						const wt = data.worktrees.find(
							(w) => w.path === input.worktreePath,
						);
						if (wt) {
							wt.branch = input.branch;
							if (wt.gitStatus) {
								wt.gitStatus.branch = input.branch;
							}
						}
					});
				} catch (dbError) {
					await rollbackCheckout(git, originalBranch);

					const dbMessage =
						dbError instanceof Error ? dbError.message : String(dbError);
					throw new Error(`Database update failed: ${dbMessage}`);
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
		const headRef = await git.raw([
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
	} catch {
		// Ignore errors - checked out branches info is optional
	}

	return checkedOutBranches;
}

async function getCurrentBranch(
	git: ReturnType<typeof simpleGit>,
	storedBranch: string | undefined,
): Promise<string> {
	if (storedBranch) return storedBranch;

	try {
		const branchSummary = await git.branch();
		return branchSummary.current;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not determine current branch: ${message}`);
	}
}

async function rollbackCheckout(
	git: ReturnType<typeof simpleGit>,
	originalBranch: string,
): Promise<void> {
	try {
		await git.checkout(originalBranch);
	} catch (rollbackError) {
		const rollbackMessage =
			rollbackError instanceof Error
				? rollbackError.message
				: String(rollbackError);
		console.error(
			`Git rollback failed after DB update error: ${rollbackMessage}`,
		);
	}
}
