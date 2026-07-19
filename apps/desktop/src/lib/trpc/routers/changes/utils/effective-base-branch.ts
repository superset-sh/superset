import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { SimpleGit } from "simple-git";
import { getBranchBaseConfig } from "../../workspaces/utils/base-branch-config";
import { getCurrentBranch } from "../../workspaces/utils/git";
import { getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";
import { selectEffectiveBaseBranch } from "./select-effective-base-branch";

export async function getWorktreeBaseBranch(
	worktreePath: string,
	currentBranch: string | null,
): Promise<string | null> {
	const { compareBaseBranch: configuredCompareBaseBranch } = currentBranch
		? await getBranchBaseConfig({
				repoPath: worktreePath,
				branch: currentBranch,
			})
		: { compareBaseBranch: null };
	const persistedWorktree = localDb
		.select({
			branch: worktrees.branch,
			baseBranch: worktrees.baseBranch,
		})
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();
	const persistedBaseBranch =
		persistedWorktree &&
		(!currentBranch || persistedWorktree.branch === currentBranch)
			? (persistedWorktree.baseBranch?.trim() ?? null)
			: null;

	return configuredCompareBaseBranch ?? persistedBaseBranch;
}

export async function getDefaultBranch(
	git: SimpleGit,
	remoteBranches?: string[],
): Promise<string> {
	try {
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
		const match = headRef.match(/refs\/remotes\/origin\/(.+)/);
		if (match) {
			return match[1].trim();
		}
	} catch {}

	const branches =
		remoteBranches ??
		(await git
			.branch(["-r"])
			.then((summary) =>
				summary.all.map((branch) => branch.replace(/^origin\//, "")),
			)
			.catch(() => []));
	if (branches.includes("master") && !branches.includes("main")) {
		return "master";
	}

	return "main";
}

export async function resolveEffectiveBaseBranch(
	worktreePath: string,
): Promise<string> {
	const git = await getSimpleGitWithShellPath(worktreePath);
	const currentBranch = await getCurrentBranch(worktreePath);
	const [worktreeBaseBranch, defaultBranch] = await Promise.all([
		getWorktreeBaseBranch(worktreePath, currentBranch),
		getDefaultBranch(git),
	]);

	return selectEffectiveBaseBranch(worktreeBaseBranch, defaultBranch);
}
