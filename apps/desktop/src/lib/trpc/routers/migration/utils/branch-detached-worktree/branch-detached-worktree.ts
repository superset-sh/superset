import type { SimpleGit } from "simple-git";

/** v2 workspaces need a branch: give a detached worktree one at its current commit. */
export async function branchDetachedWorktree(
	git: SimpleGit,
	preferredBranch: string,
): Promise<{ branch: string; created: boolean }> {
	const head = (await git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
	if (head !== "HEAD") return { branch: head, created: false };

	const taken = new Set((await git.branchLocal()).all);
	const base = preferredBranch.trim() || "recovered";
	let branch = base;
	for (let n = 2; taken.has(branch); n++) branch = `${base}-${n}`;
	await git.raw(["switch", "--create", branch]);
	return { branch, created: true };
}
