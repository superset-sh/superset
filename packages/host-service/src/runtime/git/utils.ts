import type { SimpleGit } from "simple-git";

export async function getRemoteUrl(git: SimpleGit): Promise<string | null> {
	try {
		const url = await git.remote(["get-url", "origin"]);
		return url?.trim() || null;
	} catch {
		// Common (and expected) failure modes: not a git repo, no `origin`
		// remote configured. Callers handle null and don't need a log.
		return null;
	}
}
