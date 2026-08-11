import { isAbsolute, normalize, resolve, sep } from "node:path";
import { projects, worktrees } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { PathValidationCode } from "shared/changes-types";

/**
 * Security model for desktop app filesystem access:
 *
 * THREAT MODEL:
 * While a compromised renderer can execute commands via terminal panes,
 * the File Viewer presents a distinct threat: malicious repositories can
 * contain symlinks that trick users into reading/writing sensitive files
 * (e.g., `docs/config.yml` → `~/.bashrc`). Users clicking these links
 * don't know they're accessing files outside the repo.
 *
 * PRIMARY BOUNDARY: assertRegisteredWorktree()
 * - Only worktree paths registered in localDb are accessible via tRPC
 * - Prevents direct filesystem access to unregistered paths
 *
 * SECONDARY: validateRelativePath()
 * - Rejects absolute paths and ".." traversal segments
 * - Defense in depth against path manipulation
 *
 * SYMLINK PROTECTION:
 * - Filesystem operations should delegate to `workspace-fs`. Mutations are
 *   confined to the workspace root; reads are host-wide, but file-content
 *   reads (`readFile`) still reject in-workspace symlinks that resolve
 *   outside the root, so a malicious repo can't disguise a sensitive host
 *   file's contents as a workspace file. `listDirectory`/`getMetadata` don't
 *   apply this check: `getMetadata` lstats (never follows links) and
 *   directory listings only expose entry names.
 * - This module remains focused on registered-worktree and relative-path validation.
 */

const PATH_VALIDATION_TO_TRPC: Record<PathValidationCode, TRPCError["code"]> = {
	// A worktree that was deleted while a poller still references it is the
	// common case — a missing resource, not a server fault.
	UNREGISTERED_WORKTREE: "NOT_FOUND",
	ABSOLUTE_PATH: "BAD_REQUEST",
	PATH_TRAVERSAL: "BAD_REQUEST",
	INVALID_TARGET: "BAD_REQUEST",
	SYMLINK_ESCAPE: "FORBIDDEN",
};

function pathValidationError(
	message: string,
	code: PathValidationCode,
): TRPCError {
	return new TRPCError({
		code: PATH_VALIDATION_TO_TRPC[code],
		message,
		cause: { kind: "PATH_VALIDATION", code },
	});
}

/**
 * Validates that a workspace path is registered in localDb.
 * This is THE critical security boundary.
 *
 * Accepts:
 * - Worktree paths (from worktrees table)
 * - Project mainRepoPath (for branch workspaces that work on the main repo)
 *
 * @throws TRPCError if path is not registered
 */
export function assertRegisteredWorktree(workspacePath: string): void {
	// Check worktrees table first (most common case)
	const worktreeExists = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, workspacePath))
		.get();

	if (worktreeExists) {
		return;
	}

	// Check projects.mainRepoPath for branch workspaces
	const projectExists = localDb
		.select()
		.from(projects)
		.where(eq(projects.mainRepoPath, workspacePath))
		.get();

	if (projectExists) {
		return;
	}

	throw pathValidationError(
		"Workspace path not registered in database",
		"UNREGISTERED_WORKTREE",
	);
}

/**
 * Gets the worktree record if registered. Returns record for updates.
 * Only works for actual worktrees, not project mainRepoPath.
 *
 * @throws TRPCError if worktree is not registered
 */
export function getRegisteredWorktree(
	worktreePath: string,
): typeof worktrees.$inferSelect {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();

	if (!worktree) {
		throw pathValidationError(
			"Worktree not registered in database",
			"UNREGISTERED_WORKTREE",
		);
	}

	return worktree;
}

/**
 * Options for path validation.
 */
export interface ValidatePathOptions {
	/**
	 * Allow empty/root path (resolves to worktree itself).
	 * Default: false (prevents accidental worktree deletion)
	 */
	allowRoot?: boolean;
}

/**
 * Validates a relative file path for safety.
 * Rejects absolute paths and path traversal attempts.
 *
 * @throws TRPCError if path is invalid
 */
export function validateRelativePath(
	filePath: string,
	options: ValidatePathOptions = {},
): void {
	const { allowRoot = false } = options;

	// Reject absolute paths
	if (isAbsolute(filePath)) {
		throw pathValidationError(
			"Absolute paths are not allowed",
			"ABSOLUTE_PATH",
		);
	}

	const normalized = normalize(filePath);
	const segments = normalized.split(sep);

	// Reject ".." as a path segment (allows "..foo" directories)
	if (segments.includes("..")) {
		throw pathValidationError("Path traversal not allowed", "PATH_TRAVERSAL");
	}

	// Reject root path unless explicitly allowed
	if (!allowRoot && (normalized === "" || normalized === ".")) {
		throw pathValidationError("Cannot target worktree root", "INVALID_TARGET");
	}
}

/**
 * Validates and resolves a path within a worktree. Sync, simple.
 *
 * @param worktreePath - The worktree base path
 * @param filePath - The relative file path to validate
 * @param options - Validation options
 * @returns The resolved full path
 * @throws TRPCError if path is invalid
 */
export function resolvePathInWorktree(
	worktreePath: string,
	filePath: string,
	options: ValidatePathOptions = {},
): string {
	validateRelativePath(filePath, options);
	// Use resolve to handle any worktreePath (relative or absolute)
	return resolve(worktreePath, normalize(filePath));
}

/**
 * Validates a path for git commands. Lighter check that allows root.
 *
 * @throws TRPCError if path is invalid
 */
export function assertValidGitPath(filePath: string): void {
	validateRelativePath(filePath, { allowRoot: true });
}
