import path from "node:path";
import {
	type FsReadResult,
	isPathWithinRoot,
	normalizeAbsolutePath,
	readFileAtPath,
	toErrorMessage,
} from "@superset/workspace-fs/host";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	getServiceForRootPath,
	getServiceForWorkspace,
	resolveWorkspaceRootPath,
} from "../workspace-fs-service";

/**
 * Reads a file for a workspace. Reads are jailed to the workspace root.
 *
 * `allowOutsideRoot` lets a caller opt into reading an explicit absolute path
 * that resolves OUTSIDE the root. This exists only for the file viewer opening
 * a path the user explicitly pointed at — e.g. a terminal link to
 * `~/tmp/commit_1234.txt`, which the link detector already validated with an
 * unjailed stat, and which would otherwise surface as "File not found" even
 * though the file exists (and `vim` opens it fine). Every other caller omits
 * the flag and stays jailed, so this never becomes a general arbitrary-read
 * primitive.
 *
 * In-root paths always go through the jailed service, keeping its
 * symlink-escape protection intact.
 */
async function readWorkspaceFile(
	workspaceId: string,
	args: {
		absolutePath: string;
		offset?: number;
		maxBytes?: number;
		encoding?: string;
	},
	allowOutsideRoot: boolean,
): Promise<FsReadResult> {
	const rootPath = resolveWorkspaceRootPath(workspaceId);

	if (
		allowOutsideRoot &&
		path.isAbsolute(args.absolutePath) &&
		!isPathWithinRoot(rootPath, args.absolutePath)
	) {
		return await readFileAtPath({
			...args,
			absolutePath: normalizeAbsolutePath(args.absolutePath),
		});
	}

	return await getServiceForRootPath(rootPath).readFile(args);
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
					// Opt-in for the file viewer to open a user-pointed path outside
					// the workspace root (e.g. a terminal link). Defaults off so every
					// other caller stays jailed.
					allowOutsideRoot: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const result = await readWorkspaceFile(
					input.workspaceId,
					{
						absolutePath: input.absolutePath,
						offset: input.offset,
						maxBytes: input.maxBytes,
						encoding: input.encoding,
					},
					input.allowOutsideRoot ?? false,
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
				return await service.getMetadata({
					absolutePath: input.absolutePath,
				});
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

				return await service.writeFile({
					absolutePath: input.absolutePath,
					content,
					encoding: input.encoding,
					options: input.options,
					precondition: input.precondition,
				});
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
				return await service.createDirectory({
					absolutePath: input.absolutePath,
					recursive: input.recursive,
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
				return await service.searchFiles({
					query: trimmedQuery,
					includeHidden: input.includeHidden,
					includePattern: input.includePattern,
					excludePattern: input.excludePattern,
					limit: input.limit,
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
				const trimmedQuery = input.query.trim();
				if (!trimmedQuery) {
					return { matches: [] };
				}

				const service = getServiceForWorkspace(input.workspaceId);
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
				return observable<WatchPathEventBatch>((emit) => {
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

							if (
								emitIfOpen({
									events: [
										{
											kind: "overflow",
											absolutePath: input.absolutePath,
										},
									],
								})
							) {
								runCleanup();
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
