import fs from "node:fs/promises";
import path from "node:path";
import { shell } from "electron";
import fg from "fast-glob";
import Fuse from "fuse.js";
import type { DirectoryEntry } from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const SEARCH_INDEX_TTL_MS = 30_000;
const MAX_SEARCH_RESULTS = 500;
const DEFAULT_IGNORE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/coverage/**",
];

interface FileSearchItem {
	id: string;
	name: string;
	relativePath: string;
	path: string;
	isDirectory: boolean;
}

interface FileSearchIndex {
	items: FileSearchItem[];
	fuse: Fuse<FileSearchItem>;
}

interface FileSearchCacheEntry {
	index: FileSearchIndex;
	builtAt: number;
}

const searchIndexCache = new Map<string, FileSearchCacheEntry>();
const searchIndexBuilds = new Map<string, Promise<FileSearchIndex>>();

function getSearchCacheKey({
	rootPath,
	includeHidden,
}: {
	rootPath: string;
	includeHidden: boolean;
}) {
	return `${rootPath}::${includeHidden ? "hidden" : "visible"}`;
}

async function buildSearchIndex({
	rootPath,
	includeHidden,
}: {
	rootPath: string;
	includeHidden: boolean;
}): Promise<FileSearchIndex> {
	const entries = await fg("**/*", {
		cwd: rootPath,
		onlyFiles: true,
		dot: includeHidden,
		followSymbolicLinks: false,
		unique: true,
		suppressErrors: true,
		ignore: DEFAULT_IGNORE_PATTERNS,
	});

	const items = entries.map((relativePath) => ({
		id: relativePath,
		name: path.basename(relativePath),
		relativePath,
		path: path.join(rootPath, relativePath),
		isDirectory: false,
	}));

	const fuse = new Fuse(items, {
		keys: [
			{ name: "name", weight: 2 },
			{ name: "relativePath", weight: 1 },
		],
		threshold: 0.4,
		includeScore: true,
		ignoreLocation: true,
	});

	return { items, fuse };
}

async function getSearchIndex({
	rootPath,
	includeHidden,
}: {
	rootPath: string;
	includeHidden: boolean;
}): Promise<FileSearchIndex> {
	const cacheKey = getSearchCacheKey({ rootPath, includeHidden });
	const cached = searchIndexCache.get(cacheKey);
	const now = Date.now();
	const inFlight = searchIndexBuilds.get(cacheKey);

	if (cached && now - cached.builtAt < SEARCH_INDEX_TTL_MS) {
		return cached.index;
	}

	if (cached && !inFlight) {
		const buildPromise = buildSearchIndex({ rootPath, includeHidden })
			.then((index) => {
				searchIndexCache.set(cacheKey, { index, builtAt: Date.now() });
				searchIndexBuilds.delete(cacheKey);
				return index;
			})
			.catch((error) => {
				searchIndexBuilds.delete(cacheKey);
				throw error;
			});
		searchIndexBuilds.set(cacheKey, buildPromise);
		return cached.index;
	}

	if (cached) {
		return cached.index;
	}

	if (inFlight) {
		return await inFlight;
	}

	const buildPromise = buildSearchIndex({ rootPath, includeHidden })
		.then((index) => {
			searchIndexCache.set(cacheKey, { index, builtAt: Date.now() });
			searchIndexBuilds.delete(cacheKey);
			return index;
		})
		.catch((error) => {
			searchIndexBuilds.delete(cacheKey);
			throw error;
		});
	searchIndexBuilds.set(cacheKey, buildPromise);

	return await buildPromise;
}

export const createFilesystemRouter = () => {
	return router({
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

		searchFiles: publicProcedure
			.input(
				z.object({
					rootPath: z.string(),
					query: z.string(),
					includeHidden: z.boolean().default(false),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }) => {
				const { rootPath, query, includeHidden, limit } = input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery) {
					return [];
				}

				try {
					const index = await getSearchIndex({ rootPath, includeHidden });
					const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
					const results = index.fuse.search(trimmedQuery, {
						limit: safeLimit,
					});

					return results.map((result) => ({
						id: result.item.id,
						name: result.item.name,
						relativePath: result.item.relativePath,
						path: result.item.path,
						isDirectory: false,
						score: 1 - (result.score ?? 0),
					}));
				} catch (error) {
					console.error("[filesystem/searchFiles] Failed:", {
						rootPath,
						query,
						error,
					});
					return [];
				}
			}),

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

				try {
					await fs.access(filePath);
					throw new Error(`File already exists: ${input.fileName}`);
				} catch (error) {
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

		createDirectory: publicProcedure
			.input(
				z.object({
					parentPath: z.string(),
					dirName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const dirPath = path.join(input.parentPath, input.dirName);

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

		rename: publicProcedure
			.input(
				z.object({
					oldPath: z.string(),
					newName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const newPath = path.join(path.dirname(input.oldPath), input.newName);

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

						let counter = 1;
						while (true) {
							try {
								await fs.access(destPath);
								const ext = path.extname(fileName);
								const base = path.basename(fileName, ext);
								destPath = path.join(
									input.destinationDir,
									`${base} (${counter})${ext}`,
								);
								counter++;
							} catch {
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
