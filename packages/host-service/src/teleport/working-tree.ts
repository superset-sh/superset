import { createGitRunner, type GitRunner } from "./git-runner";
import type { WorkingTreeSummary } from "./plan";
import {
	DEFAULT_PRECIOUS_PATHSPECS,
	findPreciousFiles,
} from "./precious-files";

/**
 * The counts the review dialog shows. Read before capturing, so the user is
 * told what is about to move rather than what moved.
 */
export async function summarizeWorkingTree(
	worktreePath: string,
	preciousPathspecs: readonly string[] = DEFAULT_PRECIOUS_PATHSPECS,
	git: GitRunner = createGitRunner(worktreePath),
): Promise<WorkingTreeSummary> {
	const [status, unpushed, precious] = await Promise.all([
		git.run(["status", "--porcelain=v1", "--untracked-files=all", "-z"]),
		// `--not --remotes` is "commits no remote-tracking ref can reach",
		// which is the honest answer to "would I lose this if the checkout
		// vanished". A branch with no upstream reports its whole history,
		// which is correct: none of it is anywhere else.
		git.run(["rev-list", "--count", "HEAD", "--not", "--remotes"]),
		findPreciousFiles(git, worktreePath, preciousPathspecs),
	]);

	const entries = parseStatusEntries(status);
	return {
		modified: entries.filter((entry) => !entry.startsWith("??")).length,
		untracked: entries.filter((entry) => entry.startsWith("??")).length,
		preciousFiles: precious.length,
		unpushedCommits: Number.parseInt(unpushed, 10) || 0,
	};
}

/**
 * `status -z` separates entries with NUL and, for a rename, follows the
 * entry with a second NUL-terminated path. Splitting naively would count
 * that origin path as its own change.
 */
function parseStatusEntries(status: string): string[] {
	const fields = status.split("\0").filter(Boolean);
	const entries: string[] = [];
	for (let index = 0; index < fields.length; index++) {
		const field = fields[index];
		if (!field) continue;
		entries.push(field);
		if (field.startsWith("R") || field.startsWith("C")) index++;
	}
	return entries;
}
