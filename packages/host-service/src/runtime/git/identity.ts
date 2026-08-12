// Git/GitHub identity reads. Worker-safe: no DB or event-bus imports, so
// the git/readGitIdentity worker task can bundle this module.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SimpleGit } from "simple-git";
import { createUserSimpleGit } from "./simple-git";

const execFileAsync = promisify(execFile);

export interface ResolvedGitInfo {
	githubUsername: string | null;
	authorName: string | null;
}

/** Reads `user.name` from git config. Returns null when unset or unreadable. */
export async function getGitAuthorName(git: SimpleGit): Promise<string | null> {
	try {
		const name = await git.getConfig("user.name");
		return name.value?.trim() || null;
	} catch (error) {
		console.warn("[git-identity] failed to read git user.name:", error);
		return null;
	}
}

/**
 * Resolves the authenticated GitHub username via `gh api user`, relying on
 * the user's existing `gh auth login` session. Null on any failure
 * (gh missing, not authenticated, network).
 */
export async function getGitHubUsernameViaGh(
	shellEnv: Record<string, string>,
): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"gh",
			["api", "user", "--jq", ".login"],
			{ encoding: "utf8", timeout: 10_000, env: shellEnv },
		);
		return stdout.trim() || null;
	} catch (error) {
		console.warn("[git-identity] failed to read GitHub username:", error);
		return null;
	}
}

/**
 * Git identity used to preview `author`/`github` branch prefixes in settings.
 * `shellEnv` is only for the `gh` spawn; the git config read keeps the
 * process env — simple-git rejects env containing GIT_EDITOR as unsafe.
 */
export async function readGitIdentity(
	shellEnv: Record<string, string>,
): Promise<ResolvedGitInfo> {
	const [githubUsername, authorName] = await Promise.all([
		getGitHubUsernameViaGh(shellEnv),
		getGitAuthorName(createUserSimpleGit()),
	]);
	return { githubUsername, authorName };
}
