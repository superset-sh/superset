import type { Stats } from "node:fs";
import {
	lstat,
	readFile,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
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

		// Ensure realpath is within worktree (with proper boundary check)
		if (!real.startsWith(`${worktreeReal}/`) && real !== worktreeReal) {
			throw new PathValidationError(
				"File is a symlink pointing outside the worktree",
				"SYMLINK_ESCAPE",
			);
		}
	} catch (error) {
		// If realpath fails with ENOENT, file doesn't exist yet - that's OK for writes
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return;
		}
		// Re-throw PathValidationError
		if (error instanceof PathValidationError) {
			throw error;
		}
		// Other errors (permission denied, etc.) - let them propagate
		throw error;
	}
}
export const secureFs = {
	/**
	 * Read a file within a worktree.
	 */
	async readFile(
		worktreePath: string,
		filePath: string,
		encoding: BufferEncoding = "utf-8",
	): Promise<string> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);
		return readFile(fullPath, encoding);
	},

	/**
	 * Read a file as a Buffer within a worktree.
	 */
	async readFileBuffer(
		worktreePath: string,
		filePath: string,
	): Promise<Buffer> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);
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
	 * Use this to warn users when viewing files that resolve outside
	 * the worktree boundary (potential malicious repo symlink).
	 *
	 * @returns true if the file is a symlink escaping the worktree
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

			return !real.startsWith(`${worktreeReal}/`) && real !== worktreeReal;
		} catch {
			// If we can't determine, assume not escaping (file may not exist)
			return false;
		}
	},
};
