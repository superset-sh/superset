import path from "node:path";
import {
	copyPaths,
	createDirectoryAtPath,
	createFileAtPath,
	deletePaths,
	listDirectory,
	movePaths,
	pathExists,
	renamePath,
	searchFiles as searchWorkspaceFiles,
	searchKeyword as searchWorkspaceKeyword,
	statPath,
	toFileSystemChangeEvent,
	type WorkspaceFsWatchEvent,
	WorkspaceFsWatcherManager,
} from "@superset/workspace-fs/host";
import { observable } from "@trpc/server/observable";
import { shell } from "electron";
import type {
	DirectoryEntry,
	FileSystemChangeEvent,
} from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspace } from "../workspaces/utils/db-helpers";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { getWorkspacePath } from "../workspaces/utils/worktree";

const MAX_SEARCH_RESULTS = 500;

const filesystemWatcherManager = new WorkspaceFsWatcherManager();

function isClosedStreamError(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		"code" in error &&
		error.code === "ERR_INVALID_STATE"
	);
}

function resolveWorkspaceRootPath(workspaceId: string): string {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) {
		throw new Error(`Workspace not found: ${workspaceId}`);
	}

	const rootPath = getWorkspacePath(workspace);
	if (!rootPath) {
		throw new Error(`Workspace path not found: ${workspaceId}`);
	}

	return rootPath;
}

interface KeywordSearchMatch {
	id: string;
	name: string;
	relativePath: string;
	path: string;
	line: number;
	column: number;
	preview: string;
}

export const createFilesystemRouter = () => {
	return router({
		readDirectory: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<DirectoryEntry[]> => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);

				try {
					const entries = await listDirectory({
						rootPath,
						absolutePath: input.absolutePath,
					});

					return entries.map((entry) => ({
						id: entry.id,
						name: entry.name,
						path: entry.absolutePath,
						relativePath: entry.relativePath,
						isDirectory: entry.isDirectory,
					}));
				} catch (error) {
					console.error("[filesystem/readDirectory] Failed:", {
						workspaceId: input.workspaceId,
						absolutePath: input.absolutePath,
						error,
					});
					return [];
				}
			}),

		subscribe: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.subscription(({ input }) => {
				return observable<FileSystemChangeEvent>((emit) => {
					const rootPath = resolveWorkspaceRootPath(input.workspaceId);
					let unsubscribe: (() => Promise<void>) | null = null;
					let isDisposed = false;
					let cleanupInFlight = false;

					const runCleanup = () => {
						if (cleanupInFlight) {
							return;
						}

						isDisposed = true;
						if (!unsubscribe) {
							return;
						}

						cleanupInFlight = true;
						void unsubscribe().finally(() => {
							cleanupInFlight = false;
						});
					};

					const safeNext = (event: FileSystemChangeEvent) => {
						if (isDisposed) {
							return;
						}

						try {
							emit.next(event);
						} catch (error) {
							if (isClosedStreamError(error)) {
								runCleanup();
								return;
							}

							throw error;
						}
					};

					const handleEvent = (event: WorkspaceFsWatchEvent) => {
						safeNext(toFileSystemChangeEvent(event, rootPath));
					};

					void filesystemWatcherManager
						.subscribe(
							{
								workspaceId: input.workspaceId,
								rootPath,
							},
							handleEvent,
						)
						.then((cleanup) => {
							if (isDisposed) {
								void cleanup();
								return;
							}
							unsubscribe = cleanup;
						})
						.catch((error) => {
							console.error("[filesystem/subscribe] Failed:", {
								workspaceId: input.workspaceId,
								rootPath,
								error,
							});
							safeNext({
								type: "overflow",
								revision: 0,
							});
						});

					return () => {
						runCleanup();
					};
				});
			}),

		searchFiles: publicProcedure
			.input(
				z.object({
					rootPath: z.string(),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }) => {
				const { rootPath, query, includePattern, excludePattern, limit } =
					input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery) {
					return [];
				}

				try {
					const results = await searchWorkspaceFiles({
						rootPath,
						query: trimmedQuery,
						includeHidden: true,
						includePattern,
						excludePattern,
						limit,
					});

					return results.map((result) => ({
						id: result.id,
						name: result.name,
						relativePath: result.relativePath,
						path: result.absolutePath,
						isDirectory: false,
						score: result.score,
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

		searchFilesMulti: publicProcedure
			.input(
				z.object({
					roots: z.array(
						z.object({
							rootPath: z.string(),
							workspaceId: z.string(),
							workspaceName: z.string(),
						}),
					),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					limit: z.number().default(50),
				}),
			)
			.query(async ({ input }) => {
				const { roots, query, includePattern, excludePattern, limit } = input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery || roots.length === 0) {
					return [];
				}

				// Deduplicate roots that share the same path
				const seen = new Map<string, (typeof roots)[number]>();
				for (const root of roots) {
					if (!seen.has(root.rootPath)) {
						seen.set(root.rootPath, root);
					}
				}
				const uniqueRoots = [...seen.values()];

				const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
				const perRootLimit = Math.max(
					10,
					Math.ceil(safeLimit / uniqueRoots.length),
				);

				try {
					const allResults = await Promise.all(
						uniqueRoots.map(async (root) => {
							try {
								const results = await searchWorkspaceFiles({
									rootPath: root.rootPath,
									query: trimmedQuery,
									includeHidden: true,
									includePattern,
									excludePattern,
									limit: perRootLimit,
								});
								return results.map((result) => ({
									id: `${root.workspaceId}:${result.id}`,
									name: result.name,
									relativePath: result.relativePath,
									path: result.absolutePath,
									isDirectory: false,
									score: result.score,
									workspaceId: root.workspaceId,
									workspaceName: root.workspaceName,
								}));
							} catch (error) {
								console.error(
									"[filesystem/searchFilesMulti] Failed for root:",
									{ rootPath: root.rootPath, error },
								);
								return [];
							}
						}),
					);

					return allResults
						.flat()
						.sort((a, b) => b.score - a.score)
						.slice(0, safeLimit);
				} catch (error) {
					console.error("[filesystem/searchFilesMulti] Failed:", {
						query,
						error,
					});
					return [];
				}
			}),

		searchKeyword: publicProcedure
			.input(
				z.object({
					rootPath: z.string(),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }): Promise<KeywordSearchMatch[]> => {
				const { rootPath, query, includePattern, excludePattern, limit } =
					input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery) {
					return [];
				}

				try {
					const results = await searchWorkspaceKeyword({
						rootPath,
						query: trimmedQuery,
						includeHidden: true,
						includePattern,
						excludePattern,
						limit,
						runRipgrep: async (args, options) => {
							const result = await execWithShellEnv("rg", args, {
								cwd: options.cwd,
								maxBuffer: options.maxBuffer,
								windowsHide: true,
							});

							return { stdout: result.stdout };
						},
					});

					return results.map((result) => ({
						id: result.id,
						name: result.name,
						relativePath: result.relativePath,
						path: result.absolutePath,
						line: result.line,
						column: result.column,
						preview: result.preview,
					}));
				} catch (error) {
					console.error("[filesystem/searchKeyword] Failed:", {
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
					workspaceId: z.string(),
					parentAbsolutePath: z.string(),
					name: z.string(),
					content: z.string().default(""),
				}),
			)
			.mutation(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				const result = await createFileAtPath({
					rootPath,
					absolutePath: path.join(input.parentAbsolutePath, input.name),
					content: input.content,
				});
				return { path: result.absolutePath };
			}),

		createDirectory: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					parentAbsolutePath: z.string(),
					name: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				const result = await createDirectoryAtPath({
					rootPath,
					absolutePath: path.join(input.parentAbsolutePath, input.name),
				});
				return { path: result.absolutePath };
			}),

		rename: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					newName: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				const result = await renamePath({
					rootPath,
					absolutePath: input.absolutePath,
					newName: input.newName,
				});
				return {
					oldPath: result.oldAbsolutePath,
					newPath: result.newAbsolutePath,
				};
			}),

		delete: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePaths: z.array(z.string()),
					permanent: z.boolean().default(false),
				}),
			)
			.mutation(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				const result = await deletePaths({
					rootPath,
					absolutePaths: input.absolutePaths,
					permanent: input.permanent,
					trashItem: async (absolutePath) => {
						await shell.trashItem(absolutePath);
					},
				});

				return {
					deleted: result.deleted,
					errors: result.errors.map((error) => ({
						path: error.absolutePath,
						error: error.error,
					})),
				};
			}),

		move: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sourceAbsolutePaths: z.array(z.string()),
					destinationAbsolutePath: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				const result = await movePaths({
					rootPath,
					absolutePaths: input.sourceAbsolutePaths,
					destinationAbsolutePath: input.destinationAbsolutePath,
				});

				return {
					moved: result.entries,
					errors: result.errors.map((error) => ({
						path: error.absolutePath,
						error: error.error,
					})),
				};
			}),

		copy: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sourceAbsolutePaths: z.array(z.string()),
					destinationAbsolutePath: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				const result = await copyPaths({
					rootPath,
					absolutePaths: input.sourceAbsolutePaths,
					destinationAbsolutePath: input.destinationAbsolutePath,
				});

				return {
					copied: result.entries,
					errors: result.errors.map((error) => ({
						path: error.absolutePath,
						error: error.error,
					})),
				};
			}),

		exists: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				return await pathExists({
					rootPath,
					absolutePath: input.absolutePath,
				});
			}),

		stat: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const rootPath = resolveWorkspaceRootPath(input.workspaceId);
				const result = await statPath({
					rootPath,
					absolutePath: input.absolutePath,
				});
				return result;
			}),
	});
};
