import fs from "node:fs/promises";
import path from "node:path";
import { shell } from "electron";
import type { DirectoryEntry } from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Filesystem router for file tree operations
 *
 * Provides CRUD operations for files and directories,
 * used by the FilesView component in the right sidebar.
 */
export const createFilesystemRouter = () => {
	return router({
		/**
		 * List directory contents (for lazy loading tree expansion)
		 */
		readDirectory: publicProcedure
			.input(
				z.object({
					dirPath: z.string(),
					rootPath: z.string(),
					includeHidden: z.boolean().default(false),
				}),
			)
			.query(async ({ input }): Promise<DirectoryEntry[]> => {
				const { dirPath, rootPath, includeHidden } = input;

				try {
					const entries = await fs.readdir(dirPath, { withFileTypes: true });

					return entries
						.filter((entry) => includeHidden || !entry.name.startsWith("."))
						.map((entry) => {
							const fullPath = path.join(dirPath, entry.name);
							const relativePath = path.relative(rootPath, fullPath);
							return {
								id: relativePath,
								name: entry.name,
								path: fullPath,
								relativePath,
								isDirectory: entry.isDirectory(),
							};
						})
						.sort((a, b) => {
							// Directories first, then alphabetical
							if (a.isDirectory !== b.isDirectory) {
								return a.isDirectory ? -1 : 1;
							}
							return a.name.localeCompare(b.name);
						});
				} catch (error) {
					console.error("[filesystem/readDirectory] Failed:", {
						dirPath,
						error,
					});
					return [];
				}
			}),

		/**
		 * Create a new file
		 */
		createFile: publicProcedure
			.input(
				z.object({
					dirPath: z.string(),
					fileName: z.string(),
					content: z.string().default(""),
				}),
			)
			.mutation(async ({ input }) => {
				const filePath = path.join(input.dirPath, input.fileName);

				// Check if file already exists
				try {
					await fs.access(filePath);
					throw new Error(`File already exists: ${input.fileName}`);
				} catch (error) {
					// File doesn't exist, which is what we want
					if (
						error instanceof Error &&
						error.message.includes("already exists")
					) {
						throw error;
					}
				}

				await fs.writeFile(filePath, input.content, "utf-8");
				return { path: filePath };
			}),

		/**
		 * Create a new folder
		 */
		createDirectory: publicProcedure
			.input(
				z.object({
					parentPath: z.string(),
					dirName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const dirPath = path.join(input.parentPath, input.dirName);

				// Check if directory already exists
				try {
					await fs.access(dirPath);
					throw new Error(`Directory already exists: ${input.dirName}`);
				} catch (error) {
					if (
						error instanceof Error &&
						error.message.includes("already exists")
					) {
						throw error;
					}
				}

				await fs.mkdir(dirPath, { recursive: true });
				return { path: dirPath };
			}),

		/**
		 * Rename a file or folder
		 */
		rename: publicProcedure
			.input(
				z.object({
					oldPath: z.string(),
					newName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const newPath = path.join(path.dirname(input.oldPath), input.newName);

				// Check if target already exists
				try {
					await fs.access(newPath);
					throw new Error(`Target already exists: ${input.newName}`);
				} catch (error) {
					if (
						error instanceof Error &&
						error.message.includes("already exists")
					) {
						throw error;
					}
				}

				await fs.rename(input.oldPath, newPath);
				return { oldPath: input.oldPath, newPath };
			}),

		/**
		 * Delete files/folders (moves to system trash by default)
		 */
		delete: publicProcedure
			.input(
				z.object({
					paths: z.array(z.string()),
					permanent: z.boolean().default(false),
				}),
			)
			.mutation(async ({ input }) => {
				const deleted: string[] = [];
				const errors: { path: string; error: string }[] = [];

				for (const filePath of input.paths) {
					try {
						if (input.permanent) {
							await fs.rm(filePath, { recursive: true, force: true });
						} else {
							// Move to system trash (Electron API)
							await shell.trashItem(filePath);
						}
						deleted.push(filePath);
					} catch (error) {
						errors.push({
							path: filePath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				return { deleted, errors };
			}),

		/**
		 * Move files/folders to a new location
		 */
		move: publicProcedure
			.input(
				z.object({
					sourcePaths: z.array(z.string()),
					destinationDir: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const moved: { from: string; to: string }[] = [];
				const errors: { path: string; error: string }[] = [];

				for (const sourcePath of input.sourcePaths) {
					try {
						const fileName = path.basename(sourcePath);
						const destPath = path.join(input.destinationDir, fileName);

						// Check if destination already exists
						try {
							await fs.access(destPath);
							throw new Error(`Target already exists: ${fileName}`);
						} catch (accessError) {
							if (
								accessError instanceof Error &&
								accessError.message.includes("already exists")
							) {
								throw accessError;
							}
						}

						await fs.rename(sourcePath, destPath);
						moved.push({ from: sourcePath, to: destPath });
					} catch (error) {
						errors.push({
							path: sourcePath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				return { moved, errors };
			}),

		/**
		 * Copy files/folders to a new location
		 */
		copy: publicProcedure
			.input(
				z.object({
					sourcePaths: z.array(z.string()),
					destinationDir: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const copied: { from: string; to: string }[] = [];
				const errors: { path: string; error: string }[] = [];

				for (const sourcePath of input.sourcePaths) {
					try {
						const fileName = path.basename(sourcePath);
						let destPath = path.join(input.destinationDir, fileName);

						// If destination exists, add a suffix
						let counter = 1;
						while (true) {
							try {
								await fs.access(destPath);
								// File exists, try with suffix
								const ext = path.extname(fileName);
								const base = path.basename(fileName, ext);
								destPath = path.join(
									input.destinationDir,
									`${base} (${counter})${ext}`,
								);
								counter++;
							} catch {
								// File doesn't exist, we can use this path
								break;
							}
						}

						await fs.cp(sourcePath, destPath, { recursive: true });
						copied.push({ from: sourcePath, to: destPath });
					} catch (error) {
						errors.push({
							path: sourcePath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				return { copied, errors };
			}),

		/**
		 * Check if a path exists
		 */
		exists: publicProcedure
			.input(z.object({ path: z.string() }))
			.query(async ({ input }) => {
				try {
					await fs.access(input.path);
					const stats = await fs.stat(input.path);
					return {
						exists: true,
						isDirectory: stats.isDirectory(),
						isFile: stats.isFile(),
					};
				} catch {
					return { exists: false, isDirectory: false, isFile: false };
				}
			}),

		/**
		 * Get file/folder stats
		 */
		stat: publicProcedure
			.input(z.object({ path: z.string() }))
			.query(async ({ input }) => {
				try {
					const stats = await fs.stat(input.path);
					return {
						size: stats.size,
						isDirectory: stats.isDirectory(),
						isFile: stats.isFile(),
						isSymbolicLink: stats.isSymbolicLink(),
						createdAt: stats.birthtime.toISOString(),
						modifiedAt: stats.mtime.toISOString(),
						accessedAt: stats.atime.toISOString(),
					};
				} catch (error) {
					console.error("[filesystem/stat] Failed:", {
						path: input.path,
						error,
					});
					return null;
				}
			}),
	});
};
