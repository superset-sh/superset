import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";

// Kept outside the primary checkout so editors, file watchers, and
// ignore rules treat worktrees as separate trees, not nested ones.
function defaultWorktreesRoot(): string {
	return join(homedir(), ".superset", "worktrees");
}

export function projectWorktreesRoot(
	projectId: string,
	baseDir?: string | null,
): string {
	const root = baseDir?.trim() ? baseDir : defaultWorktreesRoot();
	return resolve(root, projectId);
}

export function safeResolveWorktreePath(
	projectId: string,
	branchName: string,
	baseDir?: string | null,
): string {
	const projectRoot = projectWorktreesRoot(projectId, baseDir);
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
