import { realpath } from "node:fs/promises";
import {
	dirname,
	isAbsolute,
	normalize,
	relative,
	resolve,
	sep,
} from "node:path";
import { worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

/**
 * Security error codes for path validation failures.
 */
export type PathValidationErrorCode =
	| "ABSOLUTE_PATH"
	| "PATH_TRAVERSAL"
	| "SYMLINK_ESCAPE"
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
 *
 * This is THE critical security boundary - prevents arbitrary filesystem access.
 * A compromised renderer cannot access files outside registered worktrees.
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
 * Gets the worktree record if it exists in localDb.
 * Returns the record for additional operations (e.g., updating branch).
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
 * Checks if a relative path escapes its parent directory.
 *
 * Uses the correct segment-aware check:
 * - `..` alone escapes
 * - `../anything` escapes
 * - `..foo` does NOT escape (legitimate directory name)
 */
function escapesParent(relativePath: string): boolean {
	return (
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	);
}

/**
 * Validates a file path doesn't escape the worktree via symlinks.
 *
 * Handles new files by walking up to find the first existing ancestor
 * and validating that ancestor is within the worktree.
 *
 * @throws PathValidationError if symlink escape detected or validation fails
 */
async function assertNoSymlinkEscape(
	worktreePath: string,
	fullPath: string,
): Promise<void> {
	const realWorktree = await realpath(worktreePath);

	// Walk up to find first existing ancestor
	let checkPath = fullPath;
	const root = resolve("/");

	while (checkPath !== root) {
		try {
			const realPath = await realpath(checkPath);
			const rel = relative(realWorktree, realPath);

			if (escapesParent(rel)) {
				throw new PathValidationError(
					"Path escapes worktree via symlink",
					"SYMLINK_ESCAPE",
				);
			}

			// Found existing path and validated it - we're done
			return;
		} catch (e) {
			if (e instanceof PathValidationError) {
				throw e;
			}

			if ((e as NodeJS.ErrnoException).code === "ENOENT") {
				// Path doesn't exist, check parent
				const parent = dirname(checkPath);
				if (parent === checkPath) {
					// Hit filesystem root without finding existing path
					// This shouldn't happen for valid worktree paths
					break;
				}
				checkPath = parent;
				continue;
			}

			// For any other error (permissions, etc.), fail closed
			throw new PathValidationError(
				`Cannot verify path security: ${(e as Error).message}`,
				"SYMLINK_ESCAPE",
			);
		}
	}
}

export interface ResolveSecurePathOptions {
	/**
	 * Check for symlink escapes. Required for destructive operations.
	 * Default: true (fail closed)
	 */
	checkSymlinks?: boolean;

	/**
	 * Allow empty/root path (resolves to worktree itself).
	 * Default: false (prevents accidental worktree deletion)
	 */
	allowRoot?: boolean;
}

/**
 * Validates and resolves a file path within a worktree.
 *
 * Security checks:
 * 1. Rejects absolute paths
 * 2. Rejects path traversal via `..` segments
 * 3. Rejects symlink escapes (by default)
 * 4. Rejects root path unless explicitly allowed
 *
 * Uses `path.relative()` containment check - the industry standard pattern
 * from VSCode, MCP servers, and security-focused libraries.
 *
 * @param worktreePath - The registered worktree base path
 * @param filePath - The relative file path to validate
 * @param options - Validation options
 * @returns The resolved full path
 * @throws PathValidationError on any validation failure
 */
export async function resolveSecurePath(
	worktreePath: string,
	filePath: string,
	options: ResolveSecurePathOptions = {},
): Promise<string> {
	const { checkSymlinks = true, allowRoot = false } = options;

	// 1. Reject absolute paths immediately
	if (isAbsolute(filePath)) {
		throw new PathValidationError(
			"Absolute paths are not allowed",
			"ABSOLUTE_PATH",
		);
	}

	// 2. Normalize and resolve
	const normalized = normalize(filePath);
	const fullPath = resolve(worktreePath, normalized);

	// 3. Containment check via relative path
	const relativePath = relative(worktreePath, fullPath);

	if (escapesParent(relativePath)) {
		throw new PathValidationError(
			"Path escapes worktree boundary",
			"PATH_TRAVERSAL",
		);
	}

	// 4. Check for root path (empty or ".")
	if (!allowRoot && (relativePath === "" || relativePath === ".")) {
		throw new PathValidationError(
			"Cannot target worktree root",
			"INVALID_TARGET",
		);
	}

	// 5. Symlink escape check (default: enabled for safety)
	if (checkSymlinks) {
		await assertNoSymlinkEscape(worktreePath, fullPath);
	}

	return fullPath;
}

/**
 * Validates a path for use in git commands (pathspec).
 *
 * Lighter validation than resolveSecurePath - just checks for
 * obvious escapes. Git itself provides additional sandboxing.
 *
 * @param filePath - The file path to validate
 * @throws PathValidationError if path is suspicious
 */
export function assertValidGitPath(filePath: string): void {
	if (isAbsolute(filePath)) {
		throw new PathValidationError(
			"Absolute paths are not allowed in git operations",
			"ABSOLUTE_PATH",
		);
	}

	const normalized = normalize(filePath);
	const segments = normalized.split(sep);

	// Check for ".." as a segment (not substring - allows "..foo")
	if (segments.includes("..")) {
		throw new PathValidationError(
			"Path traversal not allowed in git operations",
			"PATH_TRAVERSAL",
		);
	}
}
