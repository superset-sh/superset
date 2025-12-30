import type { Stats } from "node:fs";
import { lstat, readFile, rm, stat, writeFile } from "node:fs/promises";
import { assertRegisteredWorktree, resolveSecurePath } from "./path-validation";

/**
 * Secure filesystem operations that enforce validation.
 *
 * Design principle: You cannot perform filesystem operations without
 * going through validation. The validation is built into each operation.
 *
 * All operations:
 * 1. Validate worktree is registered in database
 * 2. Validate path doesn't escape worktree
 * 3. Check for symlink escapes (configurable)
 *
 * Use Biome's restricted-imports rule to ban direct `node:fs` imports
 * in router files - this module should be the only FS access point.
 */
export const secureFs = {
	/**
	 * Read a file within a worktree.
	 *
	 * Validates path and checks for symlink escapes to prevent
	 * reading files outside the worktree via symlinks.
	 */
	async readFile(
		worktreePath: string,
		filePath: string,
		encoding: BufferEncoding = "utf-8",
	): Promise<string> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = await resolveSecurePath(worktreePath, filePath, {
			checkSymlinks: true,
		});
		return readFile(fullPath, encoding);
	},

	/**
	 * Read a file as a Buffer within a worktree.
	 *
	 * Validates path and checks for symlink escapes.
	 */
	async readFileBuffer(
		worktreePath: string,
		filePath: string,
	): Promise<Buffer> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = await resolveSecurePath(worktreePath, filePath, {
			checkSymlinks: true,
		});
		return readFile(fullPath);
	},

	/**
	 * Write content to a file within a worktree.
	 *
	 * Validates path and checks for symlink escapes to prevent
	 * writing files outside the worktree via symlinks.
	 */
	async writeFile(
		worktreePath: string,
		filePath: string,
		content: string,
	): Promise<void> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = await resolveSecurePath(worktreePath, filePath, {
			checkSymlinks: true,
		});
		await writeFile(fullPath, content, "utf-8");
	},

	/**
	 * Delete a file or directory within a worktree.
	 *
	 * DANGEROUS: Uses recursive + force deletion.
	 * Validates path and checks for symlink escapes.
	 * Explicitly prevents deleting the worktree root.
	 */
	async delete(worktreePath: string, filePath: string): Promise<void> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = await resolveSecurePath(worktreePath, filePath, {
			checkSymlinks: true,
			allowRoot: false, // Explicitly prevent deleting worktree root
		});
		await rm(fullPath, { recursive: true, force: true });
	},

	/**
	 * Get file stats within a worktree.
	 *
	 * Uses `stat` (follows symlinks) to get the real file size.
	 * This is important for size checks - lstat would return
	 * the symlink size, not the target file size.
	 */
	async stat(worktreePath: string, filePath: string): Promise<Stats> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = await resolveSecurePath(worktreePath, filePath, {
			checkSymlinks: true,
		});
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
		const fullPath = await resolveSecurePath(worktreePath, filePath, {
			checkSymlinks: true,
		});
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
			const fullPath = await resolveSecurePath(worktreePath, filePath, {
				checkSymlinks: true,
			});
			await stat(fullPath);
			return true;
		} catch {
			return false;
		}
	},
};
