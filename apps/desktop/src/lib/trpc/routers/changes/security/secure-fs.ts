import type { Stats } from "node:fs";
import { lstat, readFile, rm, stat, writeFile } from "node:fs/promises";
import {
	assertRegisteredWorktree,
	resolvePathInWorktree,
} from "./path-validation";

/**
 * Secure filesystem operations with built-in validation.
 *
 * Each operation:
 * 1. Validates worktree is registered (security boundary)
 * 2. Validates path doesn't escape worktree (defense in depth)
 * 3. Performs the filesystem operation
 *
 * See path-validation.ts for the full security model and threat assumptions.
 */
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
	 */
	async writeFile(
		worktreePath: string,
		filePath: string,
		content: string,
	): Promise<void> {
		assertRegisteredWorktree(worktreePath);
		const fullPath = resolvePathInWorktree(worktreePath, filePath);
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
};
