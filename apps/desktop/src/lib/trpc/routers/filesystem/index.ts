import {
	toErrorMessage,
	WorkspaceFsPathError,
} from "@superset/workspace-fs/host";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import type { FsErrnoCause, FsErrnoCode } from "shared/fs-error-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getServiceForWorkspace } from "../workspace-fs-service";

const ERRNO_TO_TRPC: Record<FsErrnoCode, TRPCError["code"]> = {
	ENOENT: "NOT_FOUND",
	EISDIR: "BAD_REQUEST",
	ENOTDIR: "BAD_REQUEST",
	EACCES: "FORBIDDEN",
	EPERM: "FORBIDDEN",
	ENOSPC: "PRECONDITION_FAILED",
};

const PATH_ERROR_TO_TRPC: Record<
	WorkspaceFsPathError["code"],
	TRPCError["code"]
> = {
	INVALID_TARGET: "BAD_REQUEST",
	SYMLINK_ESCAPE: "FORBIDDEN",
};

// User-environment filesystem failures become typed non-500 TRPCErrors
// (message preserved verbatim); anything unrecognized rethrows and stays a
// reported 500.
async function withFsErrorTranslation<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof WorkspaceFsPathError) {
			throw new TRPCError({
				code: PATH_ERROR_TO_TRPC[error.code],
				message: error.message,
				cause: { kind: "PATH_VALIDATION", code: error.code },
			});
		}
		const errno = (error as NodeJS.ErrnoException | null)?.code;
		if (typeof errno === "string" && errno in ERRNO_TO_TRPC) {
			const cause: FsErrnoCause = {
				kind: "FS_ERRNO",
				errno: errno as FsErrnoCode,
			};
			throw new TRPCError({
				code: ERRNO_TO_TRPC[errno as FsErrnoCode],
				message: error instanceof Error ? error.message : String(error),
				cause,
			});
		}
		throw error;
	}
}

function isClosedStreamError(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		"code" in error &&
		error.code === "ERR_INVALID_STATE"
	);
}

const writeFileContentSchema = z.union([
	z.string(),
	z.object({
		kind: z.literal("base64"),
		data: z.string(),
	}),
]);

type WatchPathEventBatch = {
	events: Array<{
		kind: string;
		absolutePath: string;
		oldAbsolutePath?: string;
	}>;
};

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
				return await withFsErrorTranslation(() =>
					service.listDirectory({
						absolutePath: input.absolutePath,
					}),
				);
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
				const result = await withFsErrorTranslation(() =>
					service.readFile({
						absolutePath: input.absolutePath,
						offset: input.offset,
						maxBytes: input.maxBytes,
						encoding: input.encoding,
					}),
				);

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
				return await withFsErrorTranslation(() =>
					service.getMetadata({
						absolutePath: input.absolutePath,
					}),
				);
			}),

		writeFile: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					content: writeFileContentSchema,
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
				const content =
					typeof input.content === "string"
						? input.content
						: new Uint8Array(Buffer.from(input.content.data, "base64"));

				return await withFsErrorTranslation(() =>
					service.writeFile({
						absolutePath: input.absolutePath,
						content,
						encoding: input.encoding,
						options: input.options,
						precondition: input.precondition,
					}),
				);
			}),

		createDirectory: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					recursive: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const service = getServiceForWorkspace(input.workspaceId);
				return await withFsErrorTranslation(() =>
					service.createDirectory({
						absolutePath: input.absolutePath,
						recursive: input.recursive,
					}),
				);
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
				return await withFsErrorTranslation(() =>
					service.deletePath({
						absolutePath: input.absolutePath,
						permanent: input.permanent,
					}),
				);
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
				return await withFsErrorTranslation(() =>
					service.movePath({
						sourceAbsolutePath: input.sourceAbsolutePath,
						destinationAbsolutePath: input.destinationAbsolutePath,
					}),
				);
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
				return await withFsErrorTranslation(() =>
					service.copyPath({
						sourceAbsolutePath: input.sourceAbsolutePath,
						destinationAbsolutePath: input.destinationAbsolutePath,
					}),
				);
			}),

		searchFiles: publicProcedure
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
				const trimmedQuery = input.query.trim();
				if (!trimmedQuery) {
					return { matches: [] };
				}

				const service = getServiceForWorkspace(input.workspaceId);
				return await withFsErrorTranslation(() =>
					service.searchFiles({
						query: trimmedQuery,
						includeHidden: input.includeHidden,
						includePattern: input.includePattern,
						excludePattern: input.excludePattern,
						limit: input.limit,
					}),
				);
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
				const trimmedQuery = input.query.trim();
				if (!trimmedQuery) {
					return { matches: [] };
				}

				const service = getServiceForWorkspace(input.workspaceId);
				return await withFsErrorTranslation(() =>
					service.searchContent({
						query: trimmedQuery,
						includeHidden: input.includeHidden,
						includePattern: input.includePattern,
						excludePattern: input.excludePattern,
						limit: input.limit,
					}),
				);
			}),

		watchPath: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
				}),
			)
			.subscription(({ input }) => {
				return observable<WatchPathEventBatch>((emit) => {
					const service = getServiceForWorkspace(input.workspaceId);
					let isDisposed = false;
					const stream = service.watchPath({
						absolutePath: input.absolutePath,
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

					const emitIfOpen = (value: WatchPathEventBatch): boolean => {
						try {
							emit.next(value);
							return true;
						} catch (error) {
							if (isClosedStreamError(error)) {
								runCleanup();
								return false;
							}

							throw error;
						}
					};

					void (async () => {
						try {
							while (!isDisposed) {
								const next = await iterator.next();
								if (next.done || isDisposed) {
									return;
								}

								if (!emitIfOpen(next.value)) {
									return;
								}
							}
						} catch (error) {
							console.error("[filesystem/watchPath] Failed:", {
								workspaceId: input.workspaceId,
								error: toErrorMessage(error),
							});

							// Never mask this as a synthetic overflow event — consumers
							// read overflow as "rescan", not "watcher died" (see watch.ts).
							runCleanup();
							try {
								emit.error(
									error instanceof Error
										? error
										: new Error(toErrorMessage(error)),
								);
							} catch {
								// Stream already closed by the client — nothing to notify.
							}
						}
					})();

					return () => {
						runCleanup();
					};
				});
			}),
	});
};
