import simpleGit from "simple-git";

/**
 * Detect the parent branch for "all changes" comparison
 * Tries common main branch names in order
 */
export async function detectParentBranch(worktreePath: string): Promise<string> {
	const git = simpleGit(worktreePath);

	// Common parent branch candidates
	const candidates = ["origin/main", "origin/master", "main", "master"];

	for (const candidate of candidates) {
		try {
			// Check if this ref exists
			await git.revparse([candidate]);
			return candidate;
		} catch {
			// Branch doesn't exist, try next
		}
	}

	// Fallback: try to get the default branch from remote
	try {
		const remoteInfo = await git.remote(["show", "origin"]);
		if (typeof remoteInfo === "string") {
			const match = remoteInfo.match(/HEAD branch:\s*(\S+)/);
			if (match) {
				const remoteBranch = `origin/${match[1]}`;
				try {
					await git.revparse([remoteBranch]);
					return remoteBranch;
				} catch {
					// Branch doesn't exist locally
				}
			}
		}
	} catch {
		// No remote configured
	}

	// Ultimate fallback: use HEAD~10 if nothing else works
	return "HEAD~10";
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(worktreePath: string): Promise<string> {
	const git = simpleGit(worktreePath);
	const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
	return branch.trim();
}
