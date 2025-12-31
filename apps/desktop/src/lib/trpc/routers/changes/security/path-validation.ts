import { isAbsolute, normalize, resolve, sep } from "node:path";
import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

/**
 * Security model for desktop app filesystem access:
 *
 * THREAT MODEL ASSUMPTION:
 * A compromised renderer can already execute arbitrary commands via
 * terminal panes. Therefore, filesystem-level symlink protections
 * provide no meaningful security boundary—an attacker with renderer
 * access can simply run `cat /etc/passwd` in a terminal.
 *
 * If your deployment exposes the renderer to untrusted content WITHOUT
 * terminal access, this model does NOT apply and symlink escape checks
 * should be re-enabled.
 *
 * PRIMARY BOUNDARY: assertRegisteredWorktree()
 * - Only worktree paths registered in localDb are accessible via tRPC
 * - Prevents direct filesystem access to unregistered paths
 *
 * SECONDARY: validateRelativePath()
 * - Rejects absolute paths and ".." traversal segments
 * - Defense in depth against path manipulation
 *
 * NOT IMPLEMENTED (intentional, see threat model above):
 * - Symlink escape detection
 * - Realpath resolution
 */

/**
 * Security error codes for path validation failures.
 */
export type PathValidationErrorCode =
	| "ABSOLUTE_PATH"
	| "PATH_TRAVERSAL"
	| "UNREGISTERED_WORKTREE"
	| "INVALID_TARGET";

/**
 * Error thrown when path validation fails.
 * Includes a code for programmatic handling.
 */
export class PathValidationError extends Error {
	constructor(
		message: string,
		public readonly code: PathValidationErrorCode,
	) {
		super(message);
		this.name = "PathValidationError";
	}
}

/**
 * Validates that a worktree path is registered in localDb.
 * This is THE critical security boundary.
 *
 * @throws PathValidationError if worktree is not registered
 */
export function assertRegisteredWorktree(worktreePath: string): void {
	const exists = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();

	if (!exists) {
		throw new PathValidationError(
			"Worktree not registered in database",
			"UNREGISTERED_WORKTREE",
		);
	}
}

/**
 * Gets the worktree record if registered. Returns record for updates.
 *
 * @throws PathValidationError if worktree is not registered
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
		throw new PathValidationError(
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
 * @throws PathValidationError if path is invalid
 */
export function validateRelativePath(
	filePath: string,
	options: ValidatePathOptions = {},
): void {
	const { allowRoot = false } = options;

	// Reject absolute paths
	if (isAbsolute(filePath)) {
		throw new PathValidationError(
			"Absolute paths are not allowed",
			"ABSOLUTE_PATH",
		);
	}

	const normalized = normalize(filePath);
	const segments = normalized.split(sep);

	// Reject ".." as a path segment (allows "..foo" directories)
	if (segments.includes("..")) {
		throw new PathValidationError(
			"Path traversal not allowed",
			"PATH_TRAVERSAL",
		);
	}

	// Reject root path unless explicitly allowed
	if (!allowRoot && (normalized === "" || normalized === ".")) {
		throw new PathValidationError(
			"Cannot target worktree root",
			"INVALID_TARGET",
		);
	}
}

/**
 * Validates and resolves a path within a worktree. Sync, simple.
 *
 * @param worktreePath - The worktree base path
 * @param filePath - The relative file path to validate
 * @param options - Validation options
 * @returns The resolved full path
 * @throws PathValidationError if path is invalid
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
 * @throws PathValidationError if path is invalid
 */
export function assertValidGitPath(filePath: string): void {
	validateRelativePath(filePath, { allowRoot: true });
}
