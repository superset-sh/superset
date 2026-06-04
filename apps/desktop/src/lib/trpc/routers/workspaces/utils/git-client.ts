import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@superset/shared/simple-git-options";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

// Superset is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git 3.36 blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
const SIMPLE_GIT_OPTIONS =
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS satisfies Partial<SimpleGitOptions>;

function createUserSimpleGit(repoPath?: string): SimpleGit {
	return repoPath
		? simpleGit(repoPath, SIMPLE_GIT_OPTIONS)
		: simpleGit(SIMPLE_GIT_OPTIONS);
}

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const git = createUserSimpleGit(repoPath);
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
