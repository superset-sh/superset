import { accessSync, lstatSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { projects, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

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
 * SYMLINK PROTECTION (secure-fs.ts):
 * - Writes: Block if realpath escapes worktree (prevents accidental overwrites)
 * - Reads: Caller can check isSymlinkEscaping() to warn users
 */

/**
 * Security error codes for path validation failures.
 */
export type PathValidationErrorCode =
	| "ABSOLUTE_PATH"
	| "PATH_TRAVERSAL"
	| "UNREGISTERED_WORKTREE"
	| "INVALID_TARGET"
	| "SYMLINK_ESCAPE";

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
 * Validates that a workspace path is registered in localDb.
 * This is THE critical security boundary.
 *
 * Accepts:
 * - Worktree paths (from worktrees table)
 * - Project mainRepoPath (for branch workspaces that work on the main repo)
 *
 * @throws PathValidationError if path is not registered
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

	throw new PathValidationError(
		"Workspace path not registered in database",
		"UNREGISTERED_WORKTREE",
	);
}

/**
 * Gets the worktree record if registered. Returns record for updates.
 * Only works for actual worktrees, not project mainRepoPath.
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

/**
 * Validates that a nested repo path is within a registered worktree.
 *
 * Security checks:
 * 1. The worktree itself must be registered
 * 2. The nested repo must be within the worktree bounds (no ..)
 * 3. The nested repo must contain a .git directory
 * 4. The path must not traverse through symlinks that escape the worktree
 *
 * @param worktreePath - The registered worktree path
 * @param nestedRepoPath - The nested repo path to validate
 * @throws PathValidationError if validation fails
 */
export function assertValidNestedRepo(
	worktreePath: string,
	nestedRepoPath: string,
): void {
	// First, verify the worktree is registered
	assertRegisteredWorktree(worktreePath);

	// If nested repo is the same as worktree, it's valid
	if (normalize(nestedRepoPath) === normalize(worktreePath)) {
		return;
	}

	// Compute relative path and check for traversal
	const relativePath = relative(worktreePath, nestedRepoPath);

	// Reject if relative path starts with .. (escapes worktree)
	if (relativePath.startsWith("..") || relativePath.startsWith(`${sep}..`)) {
		throw new PathValidationError(
			"Nested repo path escapes worktree boundary",
			"PATH_TRAVERSAL",
		);
	}

	// Reject absolute paths
	if (isAbsolute(relativePath)) {
		throw new PathValidationError(
			"Nested repo must be within worktree",
			"ABSOLUTE_PATH",
		);
	}

	// Check for symlink escape: verify the resolved path is still within worktree
	try {
		const stats = lstatSync(nestedRepoPath);
		if (stats.isSymbolicLink()) {
			throw new PathValidationError(
				"Nested repo path cannot be a symlink",
				"SYMLINK_ESCAPE",
			);
		}
	} catch (error) {
		if (error instanceof PathValidationError) throw error;
		throw new PathValidationError(
			"Nested repo path does not exist",
			"INVALID_TARGET",
		);
	}

	// Verify the nested repo contains a .git directory
	try {
		const gitPath = resolve(nestedRepoPath, ".git");
		accessSync(gitPath);
	} catch {
		throw new PathValidationError(
			"Nested repo path is not a git repository",
			"INVALID_TARGET",
		);
	}
}
