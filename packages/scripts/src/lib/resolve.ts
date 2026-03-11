import { existsSync, readFileSync, statSync } from "node:fs";
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

export function getCurrentBranch(dir: string): string | null {
	const headPath = join(dir, ".git", "HEAD");
	if (!existsSync(headPath)) return null;

	const head = readFileSync(headPath, "utf-8").trim();
	const refPrefix = "ref: refs/heads/";
	if (head.startsWith(refPrefix)) {
		return head.slice(refPrefix.length);
	}

	// Detached HEAD — return short hash
	return head.slice(0, 8);
}

export function tildeContract(absPath: string): string {
	const home = process.env.HOME;
	if (home && absPath.startsWith(home)) {
		return `~${absPath.slice(home.length)}`;
	}
	return absPath;
}
