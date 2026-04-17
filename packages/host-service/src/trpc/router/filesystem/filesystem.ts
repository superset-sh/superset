import { stat } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

function getFilesystemService(ctx: HostServiceContext, workspaceId: string) {
	try {
		return ctx.runtime.filesystem.getServiceForWorkspace(workspaceId);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith("Workspace not found:")
		) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: error.message,
			});
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
	listDirectory: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await service.listDirectory(serviceInput);
		}),

	readFile: protectedProcedure
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
			const result = await service.readFile(serviceInput);

			if (result.kind === "bytes") {
				return {
					...result,
					content: Buffer.from(result.content).toString("base64"),
				};
			}

			return result;
		}),

	getMetadata: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				absolutePath: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { workspaceId, ...serviceInput } = input;
			const service = getFilesystemService(ctx, workspaceId);
			return await service.getMetadata(serviceInput);
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

			return await service.writeFile({
				...serviceInput,
				content,
			});
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
			return await service.createDirectory(serviceInput);
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
			return await service.deletePath(serviceInput);
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
			return await service.movePath(serviceInput);
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
			return await service.copyPath(serviceInput);
		}),

	searchFiles: protectedProcedure
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
			return await service.searchFiles({
				...serviceInput,
				query: trimmedQuery,
			});
		}),

	searchContent: protectedProcedure
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
			return await service.searchContent({
				...serviceInput,
				query: trimmedQuery,
			});
		}),
});
