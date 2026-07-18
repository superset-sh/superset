import { homedir } from "node:os";
import { basename, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";

// Kept outside the primary checkout so editors, file watchers, and
// ignore rules treat worktrees as separate trees, not nested ones.
export function defaultWorktreesRoot(): string {
	return join(homedir(), ".superset", "worktrees");
}

/**
 * Human-readable directory segment for a project's worktrees. Uses the repo
 * folder name (matching the desktop path builder) rather than the opaque
 * project UUID, so worktrees land at `<base>/<repo>/<branch>` — a path users
 * can recognize on disk (#5763). `basename` guarantees a single, traversal-safe
 * segment; the UUID id is only a fallback for the (unexpected) empty-basename
 * case so paths always stay unique.
 */
export function projectDirName(project: {
	id: string;
	repoPath: string;
}): string {
	return basename(project.repoPath) || project.id;
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
	projectDir: string,
	worktreeBaseDir?: string | null,
): string {
	return resolve(worktreeBaseDir ?? defaultWorktreesRoot(), projectDir);
}

export function safeResolveWorktreePath(
	projectDir: string,
	branchName: string,
	worktreeBaseDir?: string | null,
): string {
	const projectRoot = projectWorktreesRoot(projectDir, worktreeBaseDir);
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
