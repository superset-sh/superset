import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import simpleGit, { type SimpleGit } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

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
