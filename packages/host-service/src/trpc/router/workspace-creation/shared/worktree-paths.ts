import { homedir } from "node:os";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";

// Kept outside the primary checkout so editors, file watchers, and
// ignore rules treat worktrees as separate trees, not nested ones.
//
// SUPERSET_WORKTREES_ROOT overrides the location so worktrees can live on the
// same volume as the repo they clone from — the APFS clonefile in
// .superset/setup.sh only works within a single volume, so a homedir-rooted
// default forces a slow full install when the repo lives on an external disk.
export function defaultWorktreesRoot(): string {
	const override = process.env.SUPERSET_WORKTREES_ROOT?.trim();
	if (override) return resolve(override);
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
