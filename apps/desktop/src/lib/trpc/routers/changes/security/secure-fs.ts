import type { Stats } from "node:fs";
import {
	lstat,
	readFile,
	readlink,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
	assertRegisteredWorktree,
	PathValidationError,
	resolvePathInWorktree,
} from "./path-validation";

/**
 * Secure filesystem operations with built-in validation.
 *
 * Each operation:
 * 1. Validates worktree is registered (security boundary)
 * 2. Validates path doesn't escape worktree (defense in depth)
 * 3. For writes: validates target is not a symlink escaping worktree
 * 4. Performs the filesystem operation
 *
 * See path-validation.ts for the full security model and threat assumptions.
 */

/**
 * Check if a resolved path is within the worktree boundary using path.relative().
 * This is safer than string prefix matching which can have boundary bugs.
 */
function isPathWithinWorktree(
	worktreeReal: string,
	targetReal: string,
): boolean {
	if (targetReal === worktreeReal) {
		return true;
	}
	const relativePath = relative(worktreeReal, targetReal);
	// Check if path escapes worktree:
	// - ".." means direct parent
	// - "../" prefix means ancestor escape (use sep for cross-platform)
	// - Absolute path means completely outside
	// Note: Don't use startsWith("..") as it incorrectly catches "..config" directories
	const escapesWorktree =
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath) ||
		relativePath === "";

	return !escapesWorktree;
}

/**
 * Validate that the parent directory chain stays within the worktree.
 * Handles the case where the target file doesn't exist yet (ENOENT).
 *
 * This function walks up the directory tree to find the first existing
 * ancestor and validates it. It also detects dangling symlinks by checking
 * if any component is a symlink pointing outside the worktree.
 *
 * @throws PathValidationError if any ancestor escapes the worktree
 */
async function assertParentInWorktree(
	worktreePath: string,
	fullPath: string,
): Promise<void> {
	const worktreeReal = await realpath(worktreePath);
	let currentPath = dirname(fullPath);

	// Walk up the directory tree until we find an existing directory
	while (currentPath !== dirname(currentPath)) {
		// Stop at filesystem root
		try {
			// First check if this path component is a symlink (even if target doesn't exist)
			const stats = await lstat(currentPath);

			if (stats.isSymbolicLink()) {
				// This is a symlink - validate its target even if it doesn't exist
				const linkTarget = await readlink(currentPath);
				// Resolve the link target relative to the symlink's parent
				const resolvedTarget = isAbsolute(linkTarget)
					? linkTarget
					: resolve(dirname(currentPath), linkTarget);

				// Try to get the realpath of the resolved target
				try {
					const targetReal = await realpath(resolvedTarget);
					if (!isPathWithinWorktree(worktreeReal, targetReal)) {
						throw new PathValidationError(
							"Symlink in path resolves outside the worktree",
							"SYMLINK_ESCAPE",
						);
					}
				} catch (error) {
					// Target doesn't exist - check if the resolved target path
					// would be within worktree if it existed
					if (
						error instanceof Error &&
						"code" in error &&
						error.code === "ENOENT"
					) {
						// For dangling symlinks, validate the target path itself
						// We need to check if the target, when resolved, would be in worktree
						// This is conservative: if we can't determine, fail closed
						const targetRelative = relative(worktreeReal, resolvedTarget);
						if (targetRelative.startsWith("..") || isAbsolute(targetRelative)) {
							throw new PathValidationError(
								"Dangling symlink points outside the worktree",
								"SYMLINK_ESCAPE",
							);
						}
						// Target would be within worktree if it existed - continue
						return;
					}
					if (error instanceof PathValidationError) {
						throw error;
					}
					// Other errors - fail closed for security
					throw new PathValidationError(
						"Cannot validate symlink target",
						"SYMLINK_ESCAPE",
					);
				}
				return; // Symlink validated successfully
			}

			// Not a symlink - get realpath and validate
			const parentReal = await realpath(currentPath);
			if (!isPathWithinWorktree(worktreeReal, parentReal)) {
				throw new PathValidationError(
					"Parent directory resolves outside the worktree",
					"SYMLINK_ESCAPE",
				);
			}
			return; // Found valid ancestor
		} catch (error) {
			if (error instanceof PathValidationError) {
				throw error;
			}
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				// This ancestor doesn't exist either, keep walking up
				currentPath = dirname(currentPath);
				continue;
			}
			// Other errors (EACCES, ENOTDIR, etc.) - fail closed for security
			throw new PathValidationError(
				"Cannot validate path ancestry",
				"SYMLINK_ESCAPE",
			);
		}
	}

	// Reached filesystem root without finding valid ancestor
	throw new PathValidationError(
		"Could not validate path ancestry within worktree",
		"SYMLINK_ESCAPE",
	);
}

/**
 * Check if the resolved realpath stays within the worktree boundary.
 * Prevents symlink escape attacks where a symlink points outside the worktree.
 *
 * @throws PathValidationError if realpath escapes worktree
 */
async function assertRealpathInWorktree(
	worktreePath: string,
	fullPath: string,
): Promise<void> {
	try {
		const real = await realpath(fullPath);
		const worktreeReal = await realpath(worktreePath);

		// Use path.relative for safer boundary checking
		if (!isPathWithinWorktree(worktreeReal, real)) {
			throw new PathValidationError(
				"File is a symlink pointing outside the worktree",
				"SYMLINK_ESCAPE",
			);
		}
	} catch (error) {
		// If realpath fails with ENOENT, the target doesn't exist
		// But the path itself might be a dangling symlink - check that first!
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			await assertDanglingSymlinkSafe(worktreePath, fullPath);
			return;
		}
		// Re-throw PathValidationError
		if (error instanceof PathValidationError) {
			throw error;
		}
		// Other errors (permission denied, etc.) - fail closed for security
		throw new PathValidationError(
			"Cannot validate file path",
			"SYMLINK_ESCAPE",
		);
	}
}

/**
 * Handle the ENOENT case: check if fullPath is a dangling symlink pointing outside
 * the worktree, or if it truly doesn't exist (in which case validate parent chain).
 *
 * Attack scenario this prevents:
 * - Repo contains `docs/config.yml` → symlink to `~/.ssh/some_new_file` (doesn't exist)
 * - realpath() fails with ENOENT (target missing)
 * - Without this check, we'd only validate parent (`docs/`) which is valid
 * - Write would follow symlink and create `~/.ssh/some_new_file`
 *
 * @throws PathValidationError if symlink escapes worktree
 */
async function assertDanglingSymlinkSafe(
	worktreePath: string,
	fullPath: string,
): Promise<void> {
	const worktreeReal = await realpath(worktreePath);

	try {
		// Check if the path itself exists (as a symlink or otherwise)
		const stats = await lstat(fullPath);

		if (stats.isSymbolicLink()) {
			// It's a dangling symlink - validate where it points
			const linkTarget = await readlink(fullPath);
			const resolvedTarget = isAbsolute(linkTarget)
				? linkTarget
				: resolve(dirname(fullPath), linkTarget);

			// Check if the resolved target would be within worktree
			// For dangling symlinks, we can't use realpath on the target,
			// so we check the literal resolved path
			const targetRelative = relative(worktreeReal, resolvedTarget);
			if (
				targetRelative === ".." ||
				targetRelative.startsWith(`..${sep}`) ||
				isAbsolute(targetRelative)
			) {
				throw new PathValidationError(
					"Dangling symlink points outside the worktree",
					"SYMLINK_ESCAPE",
				);
			}
			// Dangling symlink points within worktree - allow the operation
			return;
		}

		// Not a symlink but lstat succeeded - weird state, but validate parent chain
		await assertParentInWorktree(worktreePath, fullPath);
	} catch (error) {
		if (error instanceof PathValidationError) {
			throw error;
		}
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			// Path truly doesn't exist (not even as a symlink) - validate parent chain
			await assertParentInWorktree(worktreePath, fullPath);
			return;
		}
		// Other errors - fail closed
		throw new PathValidationError("Cannot validate path", "SYMLINK_ESCAPE");
	}
}
export const secureFs = {
	/**
	 * Read a file within a worktree.
	 *
	 * SECURITY: Enforces symlink-escape check. If the file is a symlink
	 * pointing outside the worktree, this will throw PathValidationError.
	 *
	 * @throws PathValidationError with code "SYMLINK_ESCAPE" if file escapes worktree
	 */
	async readFile(
		worktreePath: string,
		filePath: string,
		encoding: BufferEncoding = "utf-8",
	): Promise<string> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);

		// Block reads through symlinks that escape the worktree
		await assertRealpathInWorktree(worktreePath, fullPath);

		return readFile(fullPath, encoding);
	},

	/**
	 * Read a file as a Buffer within a worktree.
	 *
	 * SECURITY: Enforces symlink-escape check. If the file is a symlink
	 * pointing outside the worktree, this will throw PathValidationError.
	 *
	 * @throws PathValidationError with code "SYMLINK_ESCAPE" if file escapes worktree
	 */
	async readFileBuffer(
		worktreePath: string,
		filePath: string,
	): Promise<Buffer> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);

		// Block reads through symlinks that escape the worktree
		await assertRealpathInWorktree(worktreePath, fullPath);

		return readFile(fullPath);
	},

	/**
	 * Write content to a file within a worktree.
	 *
	 * SECURITY: Blocks writes if the file is a symlink pointing outside
	 * the worktree. This prevents malicious repos from tricking users
	 * into overwriting sensitive files like ~/.bashrc.
	 *
	 * @throws PathValidationError with code "SYMLINK_ESCAPE" if target escapes worktree
	 */
	async writeFile(
		worktreePath: string,
		filePath: string,
		content: string,
	): Promise<void> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);

		// Block writes through symlinks that escape the worktree
		await assertRealpathInWorktree(worktreePath, fullPath);

		await writeFile(fullPath, content, "utf-8");
	},

	/**
	 * Delete a file or directory within a worktree.
	 *
	 * DANGEROUS: Uses recursive + force deletion.
	 * Explicitly prevents deleting the worktree root.
	 */
	async delete(worktreePath: string, filePath: string): Promise<void> {
		assertRegisteredWorktree(worktreePath);
		// allowRoot: false prevents deleting the worktree itself
		const fullPath = resolvePathInWorktree(worktreePath, filePath, {
			allowRoot: false,
		});
		await rm(fullPath, { recursive: true, force: true });
	},

	/**
	 * Get file stats within a worktree.
	 *
	 * Uses `stat` (follows symlinks) to get the real file size.
	 */
	async stat(worktreePath: string, filePath: string): Promise<Stats> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);
		return stat(fullPath);
	},

	/**
	 * Get file stats without following symlinks.
	 *
	 * Use this when you need to know if something IS a symlink.
	 * For size checks, prefer `stat` instead.
	 */
	async lstat(worktreePath: string, filePath: string): Promise<Stats> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);
		return lstat(fullPath);
	},

	/**
	 * Check if a file exists within a worktree.
	 *
	 * Returns false for non-existent files and validation failures.
	 */
	async exists(worktreePath: string, filePath: string): Promise<boolean> {
		try {
			assertRegisteredWorktree(worktreePath);
			const fullPath = resolvePathInWorktree(worktreePath, filePath);
			await stat(fullPath);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Check if a file is a symlink that points outside the worktree.
	 *
	 * WARNING: This is a best-effort helper for UI warnings only.
	 * It returns `false` on errors, so it is NOT suitable as a security gate.
	 * For security enforcement, use the read/write methods which call
	 * assertRealpathInWorktree internally.
	 *
	 * @returns true if the file is definitely a symlink escaping the worktree,
	 *          false if not escaping OR if we can't determine (errors)
	 */
	async isSymlinkEscaping(
		worktreePath: string,
		filePath: string,
	): Promise<boolean> {
		try {
			assertRegisteredWorktree(worktreePath);
			const fullPath = resolvePathInWorktree(worktreePath, filePath);

			// Check if it's a symlink first
			const stats = await lstat(fullPath);
			if (!stats.isSymbolicLink()) {
				return false;
			}

			// Check if realpath escapes worktree
			const real = await realpath(fullPath);
			const worktreeReal = await realpath(worktreePath);

			return !isPathWithinWorktree(worktreeReal, real);
		} catch {
			// If we can't determine, assume not escaping (file may not exist)
			// NOTE: This makes this method unsuitable as a security gate
			return false;
		}
	},
};
