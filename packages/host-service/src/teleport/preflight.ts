import type { TeleportRefusal } from "@superset/shared/teleport";
import { createGitRunner, type GitRunner } from "./git-runner";

export interface DestinationBranchState {
	/** The destination's commit for the branch, when it has the branch. */
	tip: string | null;
	/** A destination worktree with the branch checked out, if any. */
	checkedOutAt: string | null;
	/**
	 * Commits the destination already has, offered to the source as bundle
	 * prerequisites so the pack carries only what is missing.
	 */
	tips: string[];
}

/** More tips than this add no precision and make the script unwieldy. */
const MAX_TIPS = 20_000;

export async function readDestinationBranch(
	repositoryPath: string,
	branch: string,
	git: GitRunner = createGitRunner(repositoryPath),
): Promise<DestinationBranchState> {
	const tip = await git
		.run(["rev-parse", "-q", "--verify", `refs/heads/${branch}^{commit}`])
		.catch(() => "");

	const worktrees = await git.run(["worktree", "list", "--porcelain"]);
	const listed = await git.run([
		"for-each-ref",
		"--format=%(objectname)",
		"refs/heads",
		"refs/remotes",
		"refs/tags",
	]);

	return {
		tip: tip || null,
		checkedOutAt: findCheckoutOf(worktrees, branch),
		tips: [...new Set(listed.split("\n").map((line) => line.trim()))]
			.filter(Boolean)
			.slice(0, MAX_TIPS),
	};
}

/**
 * Whether the source can hand this branch over. A destination tip that the
 * source does not contain means work exists there that a restore would bury.
 */
export async function checkDestination(input: {
	sourceWorktreePath: string;
	branch: string;
	destination: DestinationBranchState;
	sourceGit?: GitRunner;
}): Promise<TeleportRefusal | null> {
	const { branch, destination } = input;
	if (destination.checkedOutAt) {
		return {
			kind: "branch-checked-out",
			branch,
			path: destination.checkedOutAt,
		};
	}
	if (!destination.tip) return null;

	const git = input.sourceGit ?? createGitRunner(input.sourceWorktreePath);
	if (await sourceContains(git, destination.tip)) return null;
	return { kind: "branch-diverged", branch, destinationTip: destination.tip };
}

/** `worktree list --porcelain` pairs a `worktree` line with its `branch`. */
function findCheckoutOf(porcelain: string, branch: string): string | null {
	const wanted = `branch refs/heads/${branch}`;
	let path: string | null = null;
	for (const line of porcelain.split("\n")) {
		if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
		else if (line.trim() === wanted) return path;
	}
	return null;
}

async function sourceContains(
	git: GitRunner,
	commit: string,
): Promise<boolean> {
	try {
		await git.run(["cat-file", "-e", `${commit}^{commit}`]);
	} catch {
		// The source has never seen the object, so it certainly does not
		// contain it — and `merge-base` would fail rather than answer.
		return false;
	}
	return git
		.run(["merge-base", "--is-ancestor", commit, "HEAD"])
		.then(() => true)
		.catch(() => false);
}
