import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export function resolveProjectPath(pathArg?: string): string {
	const raw = pathArg ?? ".";
	const abs = resolve(raw);

	if (!existsSync(abs)) {
		throw new Error(`Path does not exist: ${abs}`);
	}

	const stat = statSync(abs);
	if (!stat.isDirectory()) {
		throw new Error(`Not a directory: ${abs}`);
	}

	return abs;
}

export function isGitRepo(dir: string): boolean {
	return existsSync(join(dir, ".git"));
}

function resolveGitDir(dir: string): string | null {
	const gitPath = join(dir, ".git");
	if (!existsSync(gitPath)) return null;

	const stat = lstatSync(gitPath);
	if (stat.isDirectory()) {
		return gitPath;
	}

	// In worktrees, .git is a file containing "gitdir: /path/to/real/.git/worktrees/name"
	const content = readFileSync(gitPath, "utf-8").trim();
	const prefix = "gitdir: ";
	if (content.startsWith(prefix)) {
		const gitdir = content.slice(prefix.length);
		// Resolve relative paths against the worktree directory
		return resolve(dir, gitdir);
	}

	return null;
}

export function getCurrentBranch(dir: string): string | null {
	const gitDir = resolveGitDir(dir);
	if (!gitDir) return null;

	const headPath = join(gitDir, "HEAD");
	if (!existsSync(headPath)) return null;

	const head = readFileSync(headPath, "utf-8").trim();
	const refPrefix = "ref: refs/heads/";
	if (head.startsWith(refPrefix)) {
		return head.slice(refPrefix.length);
	}

	// Detached HEAD — not on a branch
	return null;
}

export function tildeContract(absPath: string): string {
	const home = process.env.HOME;
	if (
		home &&
		(absPath === home ||
			absPath.startsWith(`${home}/`) ||
			absPath.startsWith(`${home}\\`))
	) {
		return `~${absPath.slice(home.length)}`;
	}
	return absPath;
}
