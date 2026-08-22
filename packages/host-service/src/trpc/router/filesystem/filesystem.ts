import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { WorkspaceFsPathError } from "@superset/workspace-fs/host";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	ProjectNotFoundError,
	WorkspaceNotFoundError,
} from "../../../runtime/filesystem/filesystem";
import { expandTildeAbsolute } from "../../../runtime/paths";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, queryProcedure, router } from "../../index";

type FsErrnoCode =
	| "ENOENT"
	| "EISDIR"
	| "ENOTDIR"
	| "EACCES"
	| "EPERM"
	| "ENOSPC";

interface FsErrnoCause {
	kind: "FS_ERRNO";
	errno: FsErrnoCode;
}

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

/**
 * Translates user-environment filesystem failures into typed non-500
 * TRPCErrors (message preserved verbatim); anything unrecognized rethrows and
 * stays a reported 500.
 */
function translateFsError(error: unknown): never {
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

async function withFsErrorTranslation<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		translateFsError(error);
	}
}

function getFilesystemService(ctx: HostServiceContext, workspaceId: string) {
	try {
		return ctx.runtime.filesystem.getServiceForWorkspace(workspaceId);
	} catch (error) {
		if (error instanceof WorkspaceNotFoundError) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: error.message,
			});
		}
		throw error;
	}
}

function getProjectFilesystemService(
	ctx: HostServiceContext,
	projectId: string,
) {
	try {
		return ctx.runtime.filesystem.getServiceForProject(projectId);
	} catch (error) {
		// "Project not found" just means the repo hasn't been cloned on this host
		// yet (no workspace ever created for it). Return null so callers can degrade
		// gracefully rather than throwing a 404.
		if (error instanceof ProjectNotFoundError) {
			return null;
		}
		throw error;
	}
}

const writeFileContentSchema = z.union([
	z.string(),
	z.object({
		kind: z.literal("base64"),
		data: z.string(),
	}),
]);

export const filesystemRouter = router({
	/**
	 * Browse any directory on the host filesystem. Unlike `listDirectory`,
	 * this is not scoped to a workspace — used by the project setup flow to
	 * pick a parent/repo path on a host that doesn't yet have a workspace.
	 *
	 * Path handling: absolute paths or ~-prefixed paths only. Returns the
	 * normalized absolute path along with subdirectory entries, sorted with
	 * dotfiles last.
	 */
	browseHost: protectedProcedure
		.input(
			z.object({
				path: z.string().optional(),
				includeHidden: z.boolean().optional(),
			}),
		)
		.query(async ({ input }) => {
			const targetPath = input.path
				? expandTildeAbsolute(input.path)
				: homedir();

			let stats: Awaited<ReturnType<typeof stat>>;
			try {
				stats = await stat(targetPath);
			} catch {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Path not found: ${targetPath}`,
				});
			}
			if (!stats.isDirectory()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Not a directory: ${targetPath}`,
				});
			}

			let rawEntries: Array<{
				name: string;
				isDirectory: boolean;
				isSymlink: boolean;
			}>;
			try {
				const dirents = await readdir(targetPath, {
					withFileTypes: true,
					encoding: "utf8",
				});
				rawEntries = dirents.map((d) => ({
					name: d.name,
					isDirectory: d.isDirectory(),
					isSymlink: d.isSymbolicLink(),
				}));
			} catch (err) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						err instanceof Error
							? err.message
							: `Cannot read directory: ${targetPath}`,
				});
			}

			const entries = rawEntries
				.filter((e) => input.includeHidden || !e.name.startsWith("."))
				.sort((a, b) => {
					const aHidden = a.name.startsWith(".");
					const bHidden = b.name.startsWith(".");
					if (aHidden !== bHidden) return aHidden ? 1 : -1;
					if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
					return a.name.localeCompare(b.name);
				});

			const parent = dirname(targetPath);
			return {
				path: targetPath,
				parentPath: parent === targetPath ? null : parent,
				homePath: homedir(),
				entries,
			};
		}),

	listDirectory: queryProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
			}),
		)
		.query(async ({ ctx, input, signal }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.listDirectory(serviceInput, { signal }),
			);
		}),

	readFile: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
				offset: z.number().optional(),
				maxBytes: z.number().optional(),
				encoding: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			const result = await withFsErrorTranslation(() =>
				service.readFile(serviceInput),
			);

			if (result.kind === "bytes") {
				return {
					...result,
					content: Buffer.from(result.content).toString("base64"),
				};
			}

			return result;
		}),

	getMetadata: queryProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.getMetadata(serviceInput),
			);
		}),

	/**
	 * Resolve a path (absolute or relative) against the workspace root and
	 * check if it exists. Used by the terminal link detector to validate
	 * file paths before showing them as clickable links.
	 *
	 * Accepts:
	 * - Absolute paths: /foo/bar → stat directly (must be within workspace)
	 * - Relative paths: src/file.ts → resolved against workspace root
	 * - Tilde paths: ~/foo → resolved against $HOME
	 */
	statPath: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				path: z.string(),
			}),
		)
		.mutation(
			async ({
				ctx,
				input,
			}): Promise<{
				resolvedPath: string;
				isDirectory: boolean;
			} | null> => {
				const resolvedRoot = ctx.runtime.filesystem.resolveWorkspaceRoot(
					input.workspaceId,
				);

				let targetPath: string;
				if (input.path.startsWith("~")) {
					const home = process.env.HOME ?? process.env.USERPROFILE;
					if (!home) return null;
					targetPath = join(home, input.path.substring(1));
				} else if (isAbsolute(input.path)) {
					// Absolute paths are intentionally not confined to the workspace
					// root — terminal output can reference files anywhere on the host
					// (e.g. /usr/local/bin/node, stack traces). This endpoint is
					// behind protectedProcedure so only authenticated clients can call it.
					targetPath = normalize(input.path);
				} else {
					targetPath = resolve(resolvedRoot, input.path);
				}

				try {
					const stats = await stat(targetPath);
					return {
						resolvedPath: targetPath,
						isDirectory: stats.isDirectory(),
					};
				} catch {
					return null;
				}
			},
		),

	writeFile: protectedProcedure
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
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, content: rawContent, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			const content =
				typeof rawContent === "string"
					? rawContent
					: new Uint8Array(Buffer.from(rawContent.data, "base64"));

			return await withFsErrorTranslation(() =>
				service.writeFile({
					...serviceInput,
					content,
				}),
			);
		}),

	createDirectory: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
				recursive: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.createDirectory(serviceInput),
			);
		}),

	/**
	 * Create a new entry whose name the user has not chosen yet, so the Files tab
	 * can open its inline rename on something that actually exists.
	 *
	 * The de-duplication (`Untitled`, `Untitled-2`, …) happens host-side on
	 * purpose: the client's tree listing can be stale, and each attempt here is
	 * exclusive, so an entry that already exists is never adopted. The attempt
	 * cap is a module constant rather than an input — it bounds how many syscalls
	 * one request can make.
	 */
	createUniqueEntry: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				parentAbsolutePath: z.string(),
				baseName: z.string(),
				kind: z.enum(["directory", "file"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.createUniqueEntry(serviceInput),
			);
		}),

	/** Cancel path for a provisional folder — never recursive. */
	removeEmptyDirectory: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.removeEmptyDirectory(serviceInput),
			);
		}),

	/** Cancel path for a provisional file — no-ops if it changed after creation. */
	removeFileIfUnchanged: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
				revision: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.removeFileIfUnchanged(serviceInput),
			);
		}),

	deletePath: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
				permanent: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.deletePath(serviceInput),
			);
		}),

	movePath: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				sourceAbsolutePath: z.string(),
				destinationAbsolutePath: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() => service.movePath(serviceInput));
		}),

	copyPath: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				sourceAbsolutePath: z.string(),
				destinationAbsolutePath: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() => service.copyPath(serviceInput));
		}),

	searchFiles: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z
				.object({
					workspaceId: z.string().optional(),
					projectId: z.string().optional(),
					query: z.string(),
					includeHidden: z.boolean().optional(),
					includePattern: z.string().optional(),
					excludePattern: z.string().optional(),
					limit: z.number().optional(),
				})
				.refine(
					(v) => !!v.workspaceId !== !!v.projectId,
					"Exactly one of workspaceId or projectId must be provided",
				),
		)
		.query(async ({ ctx, input }) => {
			const trimmedQuery = input.query.trim();
			if (!trimmedQuery) {
				return { matches: [] };
			}

			const { workspaceId, projectId, ...serviceInput } = input;
			const service = workspaceId
				? getFilesystemService(ctx, workspaceId)
				: getProjectFilesystemService(ctx, projectId as string);
			if (!service) {
				return { matches: [] };
			}

			return await withFsErrorTranslation(() =>
				service.searchFiles({
					...serviceInput,
					query: trimmedQuery,
				}),
			);
		}),

	searchContent: queryProcedure
		.meta({ timeoutMs: 60_000 })
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
		.query(async ({ ctx, input }) => {
			const trimmedQuery = input.query.trim();
			if (!trimmedQuery) {
				return { matches: [] };
			}

			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await withFsErrorTranslation(() =>
				service.searchContent({
					...serviceInput,
					query: trimmedQuery,
				}),
			);
		}),
});
