import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import { userGitSimpleGitOptions } from "@superset/shared/simple-git-options";
import { type SimpleGit, type SimpleGitOptions, simpleGit } from "simple-git";
import { GitEnvironmentError } from "./git-errors";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

// The git task worker sets this for the task it is running, so every git
// process built on that thread meanwhile dies with the task when the runner
// cancels it. The main thread never sets it.
let taskAbortSignal: AbortSignal | undefined;

export function setGitTaskAbortSignal(signal: AbortSignal | undefined): void {
	taskAbortSignal = signal;
}

// Superset is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
function createUserSimpleGit(
	env: Record<string, string>,
	repoPath?: string,
	overrides?: Partial<SimpleGitOptions>,
): SimpleGit {
	const options: Partial<SimpleGitOptions> = {
		...userGitSimpleGitOptions(env),
		...overrides,
	};
	if (taskAbortSignal && !options.abort) {
		options.abort = taskAbortSignal;
	}
	try {
		if (repoPath) {
			return simpleGit(repoPath, options);
		}
		return simpleGit(options);
	} catch (error) {
		throw new GitEnvironmentError(
			error instanceof Error ? error.message : String(error),
		);
	}
}

export async function getSimpleGitWithShellPath(
	repoPath?: string,
	overrides?: Partial<SimpleGitOptions>,
): Promise<SimpleGit> {
	const env = await getProcessEnvWithShellPath();
	return createUserSimpleGit(env, repoPath, overrides).env(env);
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
		signal: options?.signal ?? taskAbortSignal,
	});
}
