import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import simpleGit, { type SimpleGit } from "simple-git";
import { clearShellEnvCache, getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

// Track whether a PATH fix has already been attempted to avoid repeated slow retries
let gitPathFixAttempted = false;

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const git = repoPath ? simpleGit(repoPath) : simpleGit();
	git.env(await getProcessEnvWithShellPath());
	return git;
}

/**
 * Runs a SimpleGit operation with automatic ENOENT retry on macOS.
 *
 * On macOS, GUI apps launched from Finder/Dock inherit a minimal PATH that
 * may not include the directory containing `git`. The shell-env module tries
 * to derive the user's full PATH, but can fail (e.g. timeout on first launch).
 * When that happens, SimpleGit's `spawn("git", ...)` fails with ENOENT.
 *
 * This helper catches ENOENT, force-refreshes the shell environment, and
 * retries once — mirroring the pattern in `execWithShellEnv`.
 */
export async function runGit<T>(
	repoPath: string | undefined,
	operation: (git: SimpleGit) => Promise<T>,
): Promise<T> {
	const git = await getSimpleGitWithShellPath(repoPath);
	try {
		return await operation(git);
	} catch (error) {
		if (
			process.platform !== "darwin" ||
			gitPathFixAttempted ||
			!(error instanceof Error) ||
			!error.message.includes("ENOENT")
		) {
			throw error;
		}

		gitPathFixAttempted = true;
		console.log(
			"[git-client] git not found in PATH, retrying with refreshed shell environment",
		);

		try {
			clearShellEnvCache();
			const env = await getProcessEnvWithShellPath(process.env, {
				forceRefresh: true,
			});
			git.env(env);

			const result = await operation(git);

			// Persist the fix so future calls (including non-runGit ones) benefit
			if (env.PATH) {
				process.env.PATH = env.PATH;
			}
			gitPathFixAttempted = false;
			return result;
		} catch (retryError) {
			gitPathFixAttempted = false;
			throw retryError;
		}
	}
}

/** Reset internal retry state. Exported for testing only. */
export function _resetGitPathFixState(): void {
	gitPathFixAttempted = false;
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
