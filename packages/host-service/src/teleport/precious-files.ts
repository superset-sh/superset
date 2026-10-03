import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { GitRunner } from "./git-runner";

/**
 * Ignored files a workspace cannot be rebuilt without.
 *
 * `node_modules` is reproducible and must never travel; `.env` is not
 * reproducible by anything, and a teleported workspace without it boots
 * unable to talk to its database. Everything here is therefore both ignored
 * *and* small — the two properties that make a file worth carrying by hand.
 */
export const DEFAULT_PRECIOUS_PATHSPECS = [
	".env",
	".env.*",
	".envrc",
	".dev.vars",
] as const;

/** A file bigger than this is not a config file, whatever it is named. */
export const MAX_PRECIOUS_BYTES = 256 * 1024;

/**
 * The ignored files matching `pathspecs` that exist and are small, as
 * repo-relative paths.
 *
 * Resolving them first lets the caller `git add -f` exact paths: adding a
 * pathspec that matches nothing is an error, which would fail a teleport for
 * the common case of a project with no `.env` at all.
 */
export async function findPreciousFiles(
	git: GitRunner,
	worktreePath: string,
	pathspecs: readonly string[] = DEFAULT_PRECIOUS_PATHSPECS,
): Promise<string[]> {
	if (pathspecs.length === 0) return [];
	const listed = await git.run([
		"ls-files",
		"--others",
		"--ignored",
		"--exclude-standard",
		"-z",
		"--",
		...pathspecs,
	]);

	const found: string[] = [];
	for (const path of listed.split("\0").filter(Boolean)) {
		// A pathspec matches by name, so it can catch something large by
		// accident (`.env.backup.sql`); the size check keeps one file from
		// silently inflating every teleport of the project.
		if (await isSmallFile(join(worktreePath, path))) found.push(path);
	}
	return found;
}

async function isSmallFile(absolutePath: string): Promise<boolean> {
	try {
		const info = await stat(absolutePath);
		return info.isFile() && info.size <= MAX_PRECIOUS_BYTES;
	} catch {
		// Listed but unreadable (a dangling symlink, a race with the user
		// deleting it): skipping it is better than failing the teleport.
		return false;
	}
}
