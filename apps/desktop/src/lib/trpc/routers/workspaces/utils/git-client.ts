import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import path from "node:path";
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

export async function getGitWatchRoots(
	worktreePath: string,
): Promise<string[]> {
	const { stdout } = await execGitWithShellPath(
		["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
		{ cwd: worktreePath },
	);

	return Array.from(
		new Set(
			stdout
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean)
				.map((rootPath) =>
					path.isAbsolute(rootPath)
						? path.normalize(rootPath)
						: path.resolve(worktreePath, rootPath),
				),
		),
	);
}
