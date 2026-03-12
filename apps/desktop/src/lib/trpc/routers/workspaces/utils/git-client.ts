import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import simpleGit, { type SimpleGit } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

/**
 * Config args that disable git-lfs smudge/process filters.
 * Passed via `-c` flags so the filter binary is never invoked, even when
 * the user's global gitconfig has `git lfs install` entries but the
 * `git-lfs` binary is not on PATH.
 */
export const GIT_LFS_DISABLE_CONFIG_ARGS = [
	"-c",
	"filter.lfs.smudge=",
	"-c",
	"filter.lfs.process=",
	"-c",
	"filter.lfs.required=false",
] as const;

let gitLfsAvailableCache: boolean | null = null;

/**
 * Checks whether `git lfs version` succeeds with the shell-derived PATH.
 * Result is cached for the lifetime of the process.
 */
export async function isGitLfsAvailable(): Promise<boolean> {
	if (gitLfsAvailableCache !== null) return gitLfsAvailableCache;
	try {
		await execGitWithShellPath(["lfs", "version"]);
		gitLfsAvailableCache = true;
	} catch {
		gitLfsAvailableCache = false;
	}
	return gitLfsAvailableCache;
}

/**
 * Returns the `-c` args needed to disable LFS filters when `git-lfs` is
 * not available. Returns an empty array when LFS is available so callers
 * can always spread the result into their args list.
 */
export async function getGitLfsConfigArgs(): Promise<readonly string[]> {
	return (await isGitLfsAvailable()) ? [] : GIT_LFS_DISABLE_CONFIG_ARGS;
}

/** Reset the cached LFS availability flag (for testing). */
export function resetGitLfsCache(): void {
	gitLfsAvailableCache = null;
}

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const git = repoPath ? simpleGit(repoPath) : simpleGit();
	git.env(await getProcessEnvWithShellPath());
	return git;
}

export async function execGitWithShellPath(
	args: string[],
	options?: Omit<ExecFileOptionsWithStringEncoding, "encoding">,
): Promise<{ stdout: string; stderr: string }> {
	const env = await getProcessEnvWithShellPath(
		options?.env ? { ...process.env, ...options.env } : process.env,
	);

	return execFileAsync("git", args, {
		...options,
		encoding: "utf8",
		env,
	});
}
