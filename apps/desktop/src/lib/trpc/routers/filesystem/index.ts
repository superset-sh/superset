import { observable } from "@trpc/server/observable";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	copyWorkspacePaths,
	createWorkspaceDirectory,
	createWorkspaceFile,
	deleteWorkspacePaths,
	getWorkspaceFsServiceInfo,
	moveWorkspacePaths,
	readWorkspaceDirectory,
	renameWorkspacePath,
	searchWorkspaceFiles,
	searchWorkspaceFilesMulti,
	searchWorkspaceKeyword,
	statWorkspacePath,
	watchWorkspaceFileSystemEvents,
	workspacePathExists,
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
		getServiceInfo: publicProcedure.query(async () => {
			return await getWorkspaceFsServiceInfo();
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
					return await readWorkspaceDirectory(input);
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
					let isDisposed = false;
					const stream = watchWorkspaceFileSystemEvents(input.workspaceId);
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

								const event = next.value;
								if (isDisposed) {
									return;
								}
								safeNext(event);
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
				const { workspaceId, query, includePattern, excludePattern, limit } =
					input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery) {
					return [];
				}

				try {
					return await searchWorkspaceFiles({
						workspaceId,
						query: trimmedQuery,
						includePattern,
						excludePattern,
						limit,
					});
				} catch (error) {
					console.error("[filesystem/searchFiles] Failed:", {
						workspaceId,
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

				try {
					return await searchWorkspaceFilesMulti({
						roots,
						query: trimmedQuery,
						includePattern,
						excludePattern,
						limit,
					});
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
					workspaceId: z.string(),
					query: z.string(),
					includePattern: z.string().default(""),
					excludePattern: z.string().default(""),
					limit: z.number().default(200),
				}),
			)
			.query(async ({ input }) => {
				const { workspaceId, query, includePattern, excludePattern, limit } =
					input;
				const trimmedQuery = query.trim();

				if (!trimmedQuery) {
					return [];
				}

				try {
					return await searchWorkspaceKeyword({
						workspaceId,
						query: trimmedQuery,
						includePattern,
						excludePattern,
						limit,
					});
				} catch (error) {
					console.error("[filesystem/searchKeyword] Failed:", {
						workspaceId,
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
				return await createWorkspaceFile(input);
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
				return await createWorkspaceDirectory(input);
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
				return await renameWorkspacePath(input);
			}),

		delete: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePaths: z.array(z.string()),
					permanent: z.boolean().default(false),
				}),
			)
			.mutation(async ({ input }) => await deleteWorkspacePaths(input)),

		move: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sourceAbsolutePaths: z.array(z.string()),
					destinationAbsolutePath: z.string(),
				}),
			)
			.mutation(async ({ input }) => await moveWorkspacePaths(input)),

		copy: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sourceAbsolutePaths: z.array(z.string()),
					destinationAbsolutePath: z.string(),
				}),
			)
			.mutation(async ({ input }) => await copyWorkspacePaths(input)),

		exists: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }) => await workspacePathExists(input)),

		stat: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.query(async ({ input }) => await statWorkspacePath(input)),
	});
};
