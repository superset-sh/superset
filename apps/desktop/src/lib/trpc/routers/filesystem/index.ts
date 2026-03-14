import path from "node:path";
import { toRelativePath } from "@superset/workspace-fs/core";
import { observable } from "@trpc/server/observable";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	getServiceForWorkspace,
	resolveWorkspaceRootPath,
} from "../workspace-fs-service";

function isClosedStreamError(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		"code" in error &&
		error.code === "ERR_INVALID_STATE"
	);
}

export const createFilesystemRouter = () => {
	return router({
		listDirectory: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await service.listDirectory({
					absolutePath: input.absolutePath,
				});
			}),

		readFile: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					offset: z.number().optional(),
					maxBytes: z.number().optional(),
					encoding: z.string().optional(),
				}),
			)
			.query(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				const result = await service.readFile({
					absolutePath: input.absolutePath,
					offset: input.offset,
					maxBytes: input.maxBytes,
					encoding: input.encoding,
				});
				if (result.kind === "bytes") {
					return {
						...result,
						content: Buffer.from(result.content).toString("base64"),
					};
				}
				return result;
			}),

		getMetadata: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await service.getMetadata({
					absolutePath: input.absolutePath,
				});
			}),

		writeFile: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					content: z.string(),
					encoding: z.string().optional(),
					options: z
						.object({
							create: z.boolean(),
							overwrite: z.boolean(),
						})
						.optional(),
					precondition: z
						.object({
							ifMatch: z.string(),
						})
						.optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await service.writeFile({
					absolutePath: input.absolutePath,
					content: input.content,
					encoding: input.encoding,
					options: input.options,
					precondition: input.precondition,
				});
			}),

		createDirectoryNew: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await service.createDirectory({
					absolutePath: input.absolutePath,
				});
			}),

		deletePath: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					permanent: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await service.deletePath({
					absolutePath: input.absolutePath,
					permanent: input.permanent,
				});
			}),

		movePath: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sourceAbsolutePath: z.string(),
					destinationAbsolutePath: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await service.movePath({
					sourceAbsolutePath: input.sourceAbsolutePath,
					destinationAbsolutePath: input.destinationAbsolutePath,
				});
			}),

		copyPath: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sourceAbsolutePath: z.string(),
					destinationAbsolutePath: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await service.copyPath({
					sourceAbsolutePath: input.sourceAbsolutePath,
					destinationAbsolutePath: input.destinationAbsolutePath,
				});
			}),

		searchContent: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					query: z.string(),
					includeHidden: z.boolean().optional(),
					includePattern: z.string().optional(),
					excludePattern: z.string().optional(),
					limit: z.number().optional(),
				}),
			)
			.query(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				const trimmedQuery = input.query.trim();
				if (!trimmedQuery) {
					return { matches: [] };
				}
				return await service.searchContent({
					query: trimmedQuery,
					includeHidden: input.includeHidden,
					includePattern: input.includePattern,
					excludePattern: input.excludePattern,
					limit: input.limit,
				});
			}),

		watchPath: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					recursive: z.boolean().optional(),
				}),
			)
			.subscription(({ input }) => {
				return observable<{
					events: Array<{
						kind: string;
						absolutePath: string;
						oldAbsolutePath?: string;
					}>;
				}>((emit) => {
					const service = getServiceForWorkspace(input.workspaceId);
					let isDisposed = false;
					const stream = service.watchPath({
						absolutePath: input.absolutePath,
						recursive: input.recursive,
					});
					const iterator = stream[Symbol.asyncIterator]();

					const runCleanup = () => {
						isDisposed = true;
						void iterator.return?.().catch((error) => {
							console.error("[filesystem/watchPath] Cleanup failed:", {
								workspaceId: input.workspaceId,
								error,
							});
						});
					};

					void (async () => {
						try {
							while (!isDisposed) {
								const next = await iterator.next();
								if (next.done || isDisposed) {
									return;
								}
								try {
									emit.next(next.value);
								} catch (error) {
									if (isClosedStreamError(error)) {
										runCleanup();
										return;
									}
									throw error;
								}
							}
						} catch (error) {
							console.error("[filesystem/watchPath] Failed:", {
								workspaceId: input.workspaceId,
								error,
							});
						}
					})();

					return () => {
						runCleanup();
					};
				});
			}),

		readDirectory: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				try {
					const rootPath = resolveWorkspaceRootPath(input.workspaceId);
					const service = getServiceForWorkspace(input.workspaceId);
					const { entries } = await service.listDirectory({
						absolutePath: input.absolutePath,
					});
					return entries.map((entry) => ({
						id: entry.absolutePath,
						name: entry.name,
						path: entry.absolutePath,
						relativePath: toRelativePath(rootPath, entry.absolutePath),
						isDirectory: entry.kind === "directory",
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
					const service = getServiceForWorkspace(input.workspaceId);
					let isDisposed = false;
					const stream = service.watchPath({
						absolutePath: rootPath,
						recursive: true,
					});
					const iterator = stream[Symbol.asyncIterator]();

					const runCleanup = () => {
						isDisposed = true;
						void iterator.return?.().catch((error) => {
							console.error("[filesystem/subscribe] Cleanup failed:", {
								workspaceId: input.workspaceId,
								error,
							});
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

					void (async () => {
						try {
							while (!isDisposed) {
								const next = await iterator.next();
								if (next.done) {
									return;
								}

								if (isDisposed) {
									return;
								}

								for (const fsEvent of next.value.events) {
									const changeEvent: FileSystemChangeEvent = {
										type: fsEvent.kind,
										absolutePath: fsEvent.absolutePath,
										oldAbsolutePath: fsEvent.oldAbsolutePath,
										relativePath: toRelativePath(
											rootPath,
											fsEvent.absolutePath,
										),
										oldRelativePath: fsEvent.oldAbsolutePath
											? toRelativePath(rootPath, fsEvent.oldAbsolutePath)
											: undefined,
										revision: 0,
									};
									safeNext(changeEvent);
								}
							}
						} catch (error) {
							console.error("[filesystem/subscribe] Failed:", {
								workspaceId: input.workspaceId,
								error,
							});
							safeNext({
								type: "overflow",
								revision: 0,
							});
						}
					})();

					return () => {
						runCleanup();
					};
				});
			}),

		searchFiles: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }) => {
				const trimmedQuery = input.query.trim();
				if (!trimmedQuery) {
					return [];
				}
				try {
					const service = getServiceForWorkspace(input.workspaceId);
					const { matches } = await service.searchFiles({
						query: trimmedQuery,
						includePattern: input.includePattern,
						excludePattern: input.excludePattern,
						limit: input.limit,
					});
					return matches.map((match) => ({
						id: match.absolutePath,
						name: match.name,
						path: match.absolutePath,
						relativePath: match.relativePath,
						isDirectory: match.kind === "directory",
						score: match.score,
					}));
				} catch (error) {
					console.error("[filesystem/searchFiles] Failed:", {
						workspaceId: input.workspaceId,
						query: input.query,
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
				const trimmedQuery = input.query.trim();
				if (!trimmedQuery || input.roots.length === 0) {
					return [];
				}
				try {
					const allResults = await Promise.all(
						input.roots.map(async (root) => {
							const service = getServiceForWorkspace(root.workspaceId);
							const { matches } = await service.searchFiles({
								query: trimmedQuery,
								includePattern: input.includePattern,
								excludePattern: input.excludePattern,
								limit: input.limit,
							});
							return matches.map((match) => ({
								id: match.absolutePath,
								name: match.name,
								path: match.absolutePath,
								relativePath: match.relativePath,
								isDirectory: match.kind === "directory",
								score: match.score,
								workspaceId: root.workspaceId,
								workspaceName: root.workspaceName,
							}));
						}),
					);
					return allResults
						.flat()
						.sort((a, b) => b.score - a.score)
						.slice(0, input.limit);
				} catch (error) {
					console.error("[filesystem/searchFilesMulti] Failed:", {
						query: input.query,
						error,
					});
					return [];
				}
			}),

		searchKeyword: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }) => {
				const trimmedQuery = input.query.trim();
				if (!trimmedQuery) {
					return [];
				}
				try {
					const service = getServiceForWorkspace(input.workspaceId);
					const { matches } = await service.searchContent({
						query: trimmedQuery,
						includePattern: input.includePattern,
						excludePattern: input.excludePattern,
						limit: input.limit,
					});
					return matches.map((match) => ({
						id: match.absolutePath,
						name: path.basename(match.absolutePath),
						path: match.absolutePath,
						relativePath: match.relativePath,
						line: match.line,
						column: match.column,
						preview: match.preview,
					}));
				} catch (error) {
					console.error("[filesystem/searchKeyword] Failed:", {
						workspaceId: input.workspaceId,
						query: input.query,
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
				const service = getServiceForWorkspace(input.workspaceId);
				const filePath = path.join(input.parentAbsolutePath, input.name);
				await service.writeFile({
					absolutePath: filePath,
					content: input.content,
					encoding: "utf-8",
					options: { create: true, overwrite: false },
				});
				return { path: filePath };
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
				const service = getServiceForWorkspace(input.workspaceId);
				const dirPath = path.join(input.parentAbsolutePath, input.name);
				await service.createDirectory({ absolutePath: dirPath });
				return { path: dirPath };
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
				const service = getServiceForWorkspace(input.workspaceId);
				const destPath = path.join(
					path.dirname(input.absolutePath),
					input.newName,
				);
				await service.movePath({
					sourceAbsolutePath: input.absolutePath,
					destinationAbsolutePath: destPath,
				});
				return { oldPath: input.absolutePath, newPath: destPath };
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
				const service = getServiceForWorkspace(input.workspaceId);
				const deleted: string[] = [];
				const errors: Array<{ path: string; error: string }> = [];

				await Promise.all(
					input.absolutePaths.map(async (absolutePath) => {
						try {
							await service.deletePath({
								absolutePath,
								permanent: input.permanent,
							});
							deleted.push(absolutePath);
						} catch (error) {
							errors.push({
								path: absolutePath,
								error: error instanceof Error ? error.message : String(error),
							});
						}
					}),
				);

				return { deleted, errors };
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
				const service = getServiceForWorkspace(input.workspaceId);
				const moved: Array<{ from: string; to: string }> = [];
				const errors: Array<{ path: string; error: string }> = [];

				await Promise.all(
					input.sourceAbsolutePaths.map(async (sourcePath) => {
						const destPath = path.join(
							input.destinationAbsolutePath,
							path.basename(sourcePath),
						);
						try {
							await service.movePath({
								sourceAbsolutePath: sourcePath,
								destinationAbsolutePath: destPath,
							});
							moved.push({ from: sourcePath, to: destPath });
						} catch (error) {
							errors.push({
								path: sourcePath,
								error: error instanceof Error ? error.message : String(error),
							});
						}
					}),
				);

				return { moved, errors };
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
				const service = getServiceForWorkspace(input.workspaceId);
				const copied: Array<{ from: string; to: string }> = [];
				const errors: Array<{ path: string; error: string }> = [];

				await Promise.all(
					input.sourceAbsolutePaths.map(async (sourcePath) => {
						const destPath = path.join(
							input.destinationAbsolutePath,
							path.basename(sourcePath),
						);
						try {
							await service.copyPath({
								sourceAbsolutePath: sourcePath,
								destinationAbsolutePath: destPath,
							});
							copied.push({ from: sourcePath, to: destPath });
						} catch (error) {
							errors.push({
								path: sourcePath,
								error: error instanceof Error ? error.message : String(error),
							});
						}
					}),
				);

				return { copied, errors };
			}),
	});
};
