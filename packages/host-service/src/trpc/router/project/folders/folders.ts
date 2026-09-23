import { randomUUID } from "node:crypto";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { projectFolders, projects } from "../../../../db/schema";
import {
	deduplicateFolderName,
	defaultFolderNameForRepo,
	ensurePrimaryProjectFolder,
	listProjectFolders,
	type ProjectFolder,
	reassignFolderPositions,
	sanitizeFolderName,
} from "../../../../projects/project-folders";
import type { HostServiceContext } from "../../../../types";
import { protectedProcedure, router } from "../../../index";
import { resolveLocalRepo } from "../utils/resolve-repo";

function requireMaterializedFolders(
	ctx: HostServiceContext,
	projectId: string,
): ProjectFolder[] {
	const folders = ensurePrimaryProjectFolder(ctx.db, projectId);
	if (folders.length === 0) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project is not set up on this host",
		});
	}
	return folders;
}

function requireFolderId(folder: ProjectFolder): string {
	if (folder.id === null) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Project folder was not materialized",
		});
	}
	return folder.id;
}

function findFolder(
	folders: ProjectFolder[],
	folderId: string,
): ProjectFolder & { id: string } {
	const match = folders.find((candidate) => candidate.id === folderId);
	if (!match?.id) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Folder not found on this project: ${folderId}`,
		});
	}
	return match as ProjectFolder & { id: string };
}

function requireFolderName(input: string): string {
	const sanitized = sanitizeFolderName(input);
	if (!sanitized) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Folder must be a single directory name of letters, digits, dot, dash or underscore",
		});
	}
	return sanitized;
}

async function mirrorPrimaryOntoProject(
	ctx: HostServiceContext,
	projectId: string,
	folder: ProjectFolder,
): Promise<void> {
	if (!folder.repoPath) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Folder "${folder.folder}" has no checkout on this host yet and cannot be the primary`,
		});
	}
	const resolved = await resolveLocalRepo(folder.repoPath);
	ctx.db
		.update(projects)
		.set({
			repoPath: resolved.repoPath,
			repoProvider: resolved.parsed ? "github" : null,
			repoOwner: resolved.parsed?.owner ?? null,
			repoName: resolved.parsed?.name ?? null,
			repoUrl: resolved.parsed?.url ?? null,
			remoteName: resolved.remoteName,
			updatedAt: Date.now(),
		})
		.where(eq(projects.id, projectId))
		.run();
	if (resolved.repoPath !== folder.repoPath) {
		ctx.db
			.update(projectFolders)
			.set({ repoPath: resolved.repoPath, updatedAt: Date.now() })
			.where(eq(projectFolders.id, folder.id ?? ""))
			.run();
	}
}

const folderShape = z.object({
	id: z.string(),
	projectId: z.string(),
	position: z.number(),
	folder: z.string(),
	repoPath: z.string().nullable(),
	repoUrl: z.string().nullable(),
	baseBranch: z.string().nullable(),
});

type FolderResponse = z.infer<typeof folderShape>;

function toResponse(folders: ProjectFolder[]): FolderResponse[] {
	return folders.map((folder) => ({
		id: folder.id ?? "",
		projectId: folder.projectId,
		position: folder.position,
		folder: folder.folder,
		repoPath: folder.repoPath,
		repoUrl: folder.repoUrl,
		baseBranch: folder.baseBranch,
	}));
}

export const projectFoldersRouter = router({
	list: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }): { folders: FolderResponse[] } => {
			const folders = listProjectFolders(ctx.db, input.projectId);
			if (folders.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return { folders: toResponse(folders) };
		}),

	/**
	 * `repoPath` links a checkout that already exists on this host; `repoUrl`
	 * alone leaves the clone to the first workspace that needs it.
	 */
	add: protectedProcedure
		.input(
			z
				.object({
					projectId: z.string().uuid(),
					repoPath: z.string().min(1).optional(),
					repoUrl: z.string().min(1).optional(),
					folder: z.string().min(1).optional(),
					baseBranch: z.string().min(1).optional(),
				})
				.refine((value) => value.repoPath || value.repoUrl, {
					message: "Pass repoPath or repoUrl",
				}),
		)
		.mutation(async ({ ctx, input }): Promise<{ folder: FolderResponse }> => {
			const folders = requireMaterializedFolders(ctx, input.projectId);

			const resolved = input.repoPath
				? await resolveLocalRepo(input.repoPath)
				: null;
			const parsedUrl = input.repoUrl ? parseGitHubRemote(input.repoUrl) : null;
			if (input.repoUrl && !parsedUrl) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Could not parse a repository from ${input.repoUrl}`,
				});
			}

			const requested = input.folder
				? requireFolderName(input.folder)
				: resolved
					? defaultFolderNameForRepo(resolved.repoPath)
					: (sanitizeFolderName(parsedUrl?.name ?? "") ?? "repo");
			const folder = deduplicateFolderName(
				requested,
				folders.map((existing) => existing.folder),
			);

			const now = Date.now();
			const id = randomUUID();
			ctx.db
				.insert(projectFolders)
				.values({
					id,
					projectId: input.projectId,
					position: folders.length,
					folder,
					repoPath: resolved?.repoPath ?? null,
					repoUrl: resolved?.parsed?.url ?? parsedUrl?.url ?? null,
					baseBranch: input.baseBranch ?? null,
					createdAt: now,
					updatedAt: now,
				})
				.run();

			const added = findFolder(listProjectFolders(ctx.db, input.projectId), id);
			return { folder: toResponse([added])[0] as FolderResponse };
		}),

	remove: protectedProcedure
		.input(
			z.object({ projectId: z.string().uuid(), folderId: z.string().min(1) }),
		)
		.mutation(({ ctx, input }): { folders: FolderResponse[] } => {
			const folders = requireMaterializedFolders(ctx, input.projectId);
			const target = findFolder(folders, input.folderId);
			if (target.position === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						folders.length === 1
							? "A project always has one primary folder"
							: `"${target.folder}" is the primary folder — make another folder primary first`,
				});
			}
			ctx.db
				.delete(projectFolders)
				.where(
					and(
						eq(projectFolders.id, target.id),
						eq(projectFolders.projectId, input.projectId),
					),
				)
				.run();
			reassignFolderPositions(
				ctx.db,
				input.projectId,
				folders
					.filter((folder) => folder.id !== target.id)
					.map(requireFolderId),
			);
			return {
				folders: toResponse(listProjectFolders(ctx.db, input.projectId)),
			};
		}),

	setPrimary: protectedProcedure
		.input(
			z.object({ projectId: z.string().uuid(), folderId: z.string().min(1) }),
		)
		.mutation(
			async ({ ctx, input }): Promise<{ folders: FolderResponse[] }> => {
				const folders = requireMaterializedFolders(ctx, input.projectId);
				const target = findFolder(folders, input.folderId);
				if (target.position !== 0) {
					await mirrorPrimaryOntoProject(ctx, input.projectId, target);
					reassignFolderPositions(ctx.db, input.projectId, [
						target.id,
						...folders
							.filter((folder) => folder.id !== target.id)
							.map(requireFolderId),
					]);
				}
				return {
					folders: toResponse(listProjectFolders(ctx.db, input.projectId)),
				};
			},
		),

	rename: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				folderId: z.string().min(1),
				folder: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }): { folder: FolderResponse } => {
			const folders = requireMaterializedFolders(ctx, input.projectId);
			const target = findFolder(folders, input.folderId);
			const folder = requireFolderName(input.folder);
			const taken = folders.some(
				(candidate) =>
					candidate.id !== target.id &&
					candidate.folder.toLowerCase() === folder.toLowerCase(),
			);
			if (taken) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Another folder in this project is already called "${folder}"`,
				});
			}
			ctx.db
				.update(projectFolders)
				.set({ folder, updatedAt: Date.now() })
				.where(
					and(
						eq(projectFolders.id, target.id),
						eq(projectFolders.projectId, input.projectId),
					),
				)
				.run();
			const renamed = findFolder(
				listProjectFolders(ctx.db, input.projectId),
				target.id,
			);
			return { folder: toResponse([renamed])[0] as FolderResponse };
		}),
});
