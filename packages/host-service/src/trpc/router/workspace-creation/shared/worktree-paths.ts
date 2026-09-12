import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	normalize,
	resolve,
	sep,
} from "node:path";
import { TRPCError } from "@trpc/server";

// Kept outside the primary checkout so editors, file watchers, and
// ignore rules treat worktrees as separate trees, not nested ones.
export function defaultWorktreesRoot(): string {
	return join(homedir(), ".superset", "worktrees");
}

export function normalizeWorktreeBaseDir(
	input: string | null | undefined,
): string | null {
	const trimmed = input?.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("~")) {
		const rest = trimmed.slice(1);
		if (rest === "" || rest.startsWith("/") || rest.startsWith("\\")) {
			return normalize(join(homedir(), rest));
		}
	}

	if (!isAbsolute(trimmed)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Worktree location must be an absolute path or start with ~",
		});
	}

	return resolve(trimmed);
}

export function projectWorktreesRoot(
	projectId: string,
	worktreeBaseDir?: string | null,
): string {
	return resolve(worktreeBaseDir ?? defaultWorktreesRoot(), projectId);
}

/**
 * True when `path` resolves strictly inside the project's managed worktrees
 * root. The destroy saga's direct `rm -rf` (taken when the project repo is
 * gone and there is nothing to run `git worktree remove` in) refuses
 * anything else, so an adopted or corrupt `worktreePath` can never delete
 * user data outside the managed folder.
 */
export function isInsideProjectWorktreesRoot(
	path: string,
	projectId: string,
	worktreeBaseDir?: string | null,
): boolean {
	// Both prefixes are canonicalised: a `<base>/<projectId>` entry that is a
	// symlink out of the base would otherwise let a path beneath it pass.
	const base = normalizePath(worktreeBaseDir ?? defaultWorktreesRoot());
	const root = normalizePath(projectWorktreesRoot(projectId, worktreeBaseDir));
	const resolved = normalizePath(path);
	return (
		root !== base &&
		root.startsWith(base + sep) &&
		resolved !== root &&
		resolved.startsWith(root + sep)
	);
}

function normalizePath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		// A dangling or unreadable leaf still has a real parent. Canonicalise
		// that so the leaf compares against the same prefix as a base that
		// sits behind a symlink (macOS `/var` → `/private/var`).
		const abs = resolve(p);
		try {
			return join(realpathSync(dirname(abs)), basename(abs));
		} catch {
			return abs;
		}
	}
}

export function safeResolveWorktreePath(
	projectId: string,
	branchName: string,
	worktreeBaseDir?: string | null,
): string {
	const projectRoot = projectWorktreesRoot(projectId, worktreeBaseDir);
	const worktreePath = resolve(projectRoot, branchName);
	if (
		worktreePath !== projectRoot &&
		!worktreePath.startsWith(projectRoot + sep)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid branch name: path traversal detected (${branchName})`,
		});
	}
	return worktreePath;
}
