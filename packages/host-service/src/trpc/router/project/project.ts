import { basename, resolve as resolvePath } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	createFromClone,
	createFromEmpty,
	createFromImportLocal,
	createFromTemplate,
} from "./handlers";
import { ensureMainWorkspace } from "./utils/ensure-main-workspace";
import { persistLocalProject } from "./utils/persist-project";
import {
	cloneRepoInto,
	type ResolvedRepo,
	resolveLocalRepo,
	resolveMatchingSlug,
} from "./utils/resolve-repo";

export const projectRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.db
			.select({
				id: projects.id,
				repoPath: projects.repoPath,
				repoOwner: projects.repoOwner,
				repoName: projects.repoName,
				repoUrl: projects.repoUrl,
			})
			.from(projects)
			.all();
	}),

	get: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }) => {
			return (
				ctx.db
					.select({
						id: projects.id,
						repoPath: projects.repoPath,
						repoOwner: projects.repoOwner,
						repoName: projects.repoName,
						repoUrl: projects.repoUrl,
					})
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get() ?? null
			);
		}),

	findBackfillConflict: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repoPath: z.string().min(1),
			}),
		)
		.query(() => {
			// Multiple v2 projects may point at the same GitHub URL, so a matching
			// repo URL is no longer a conflict. Kept for backwards-compatible
			// clients while older settings screens still call the endpoint.
			return { conflict: null };
		}),

	findByPath: protectedProcedure
		.input(z.object({ repoPath: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const resolved = await resolveLocalRepo(input.repoPath);
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.repoPath, resolved.repoPath) })
				.sync();
			if (localProject) {
				return {
					candidates: [
						{
							id: localProject.id,
							name: localProject.repoName ?? basename(resolved.repoPath),
						},
					],
				};
			}

			const { parsed } = resolved;
			if (!parsed) return { candidates: [] };
			const { candidates } = await ctx.api.v2Project.findByGitHubRemote.query({
				organizationId: ctx.organizationId,
				repoCloneUrl: parsed.url,
			});
			return { candidates };
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				mode: z.discriminatedUnion("kind", [
					z.object({
						kind: z.literal("empty"),
						parentDir: z.string().min(1),
					}),
					z.object({
						kind: z.literal("clone"),
						parentDir: z.string().min(1),
						url: z.string().min(1),
					}),
					z.object({
						kind: z.literal("importLocal"),
						repoPath: z.string().min(1),
					}),
					z.object({
						kind: z.literal("template"),
						parentDir: z.string().min(1),
						templateId: z.string().min(1),
					}),
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			switch (input.mode.kind) {
				case "empty":
					return createFromEmpty(ctx, {
						name: input.name,
						parentDir: input.mode.parentDir,
					});
				case "template":
					return createFromTemplate(ctx, {
						name: input.name,
						parentDir: input.mode.parentDir,
						templateId: input.mode.templateId,
					});
				case "clone":
					return createFromClone(ctx, {
						name: input.name,
						parentDir: input.mode.parentDir,
						url: input.mode.url,
					});
				case "importLocal":
					return createFromImportLocal(ctx, {
						name: input.name,
						repoPath: input.mode.repoPath,
					});
			}
		}),

	setup: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				mode: z.discriminatedUnion("kind", [
					z.object({
						kind: z.literal("clone"),
						parentDir: z.string().min(1),
					}),
					z.object({
						kind: z.literal("import"),
						repoPath: z.string().min(1),
						allowRelocate: z.boolean().default(false),
					}),
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existing = ctx.db
				.select({ id: projects.id, repoPath: projects.repoPath })
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();

			const cloudProject = await ctx.api.v2Project.get.query({
				organizationId: ctx.organizationId,
				id: input.projectId,
			});

			const allowRelocate =
				input.mode.kind === "import" && input.mode.allowRelocate;

			const rejectIfRepoint = (targetPath: string) => {
				if (!existing) return;
				if (existing.repoPath === targetPath) return;
				if (allowRelocate) return;
				throw new TRPCError({
					code: "CONFLICT",
					message: `Project is already set up on this device at ${existing.repoPath}. Remove it first to re-import at a different location.`,
				});
			};

			switch (input.mode.kind) {
				case "clone": {
					if (!cloudProject.repoCloneUrl) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message:
								"Project has no linked GitHub repository — cannot clone. Import an existing local folder instead.",
						});
					}
					const expectedParsed = parseGitHubRemote(cloudProject.repoCloneUrl);
					if (!expectedParsed) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Could not parse GitHub remote from ${cloudProject.repoCloneUrl}`,
						});
					}
					const predictedPath = resolvePath(
						input.mode.parentDir,
						expectedParsed.name,
					);
					rejectIfRepoint(predictedPath);
					if (existing) {
						const mainWorkspace = await ensureMainWorkspace(
							ctx,
							input.projectId,
							existing.repoPath,
						);
						return {
							repoPath: existing.repoPath,
							mainWorkspaceId: mainWorkspace?.id ?? null,
						};
					}
					const resolved = await cloneRepoInto(
						cloudProject.repoCloneUrl,
						input.mode.parentDir,
					);
					persistLocalProject(ctx, input.projectId, resolved);
					const mainWorkspace = await ensureMainWorkspace(
						ctx,
						input.projectId,
						resolved.repoPath,
					);
					return {
						repoPath: resolved.repoPath,
						mainWorkspaceId: mainWorkspace?.id ?? null,
					};
				}
				case "import": {
					let resolved: ResolvedRepo;
					if (cloudProject.repoCloneUrl) {
						const parsed = parseGitHubRemote(cloudProject.repoCloneUrl);
						if (!parsed) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: `Could not parse GitHub remote from ${cloudProject.repoCloneUrl}`,
							});
						}
						resolved = await resolveMatchingSlug(
							input.mode.repoPath,
							`${parsed.owner}/${parsed.name}`,
						);
					} else {
						resolved = await resolveLocalRepo(input.mode.repoPath);
					}

					rejectIfRepoint(resolved.repoPath);
					if (existing && existing.repoPath === resolved.repoPath) {
						const mainWorkspace = await ensureMainWorkspace(
							ctx,
							input.projectId,
							existing.repoPath,
						);
						return {
							repoPath: existing.repoPath,
							mainWorkspaceId: mainWorkspace?.id ?? null,
						};
					}

					if (!cloudProject.repoCloneUrl && resolved.parsed) {
						await ctx.api.v2Project.linkRepoCloneUrl.mutate({
							organizationId: ctx.organizationId,
							id: input.projectId,
							repoCloneUrl: resolved.parsed.url,
						});
					}
					persistLocalProject(ctx, input.projectId, resolved);
					const mainWorkspace = await ensureMainWorkspace(
						ctx,
						input.projectId,
						resolved.repoPath,
					);
					return {
						repoPath: resolved.repoPath,
						mainWorkspaceId: mainWorkspace?.id ?? null,
					};
				}
			}
		}),

	/**
	 * Project-delete saga. Cloud is reality — cloud delete is the kill point:
	 *
	 *   1. Cloud v2Project.delete   ← kill point. Cascades cloud workspaces.
	 *      on fail → abort, leave local untouched, surface error to user.
	 *
	 *   2. Local DB rows (workspaces + project)
	 *      on fail → log; user can re-run later. Cloud is already gone.
	 *
	 *   3. Best-effort `git worktree remove` for each non-main local
	 *      workspace so subsequent worktree commands aren't confused.
	 *
	 * The on-disk repo directory is NEVER auto-removed. The user's code is
	 * their code; deletion of the working tree must be an explicit action,
	 * not a side-effect of project removal. Returns repoPath so a future
	 * UI can offer an explicit "delete files too" follow-up.
	 */
	remove: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.api.v2Project.delete.mutate({
				organizationId: ctx.organizationId,
				id: input.projectId,
			});

			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) return { success: true, repoPath: null };

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
				if (ws.worktreePath === localProject.repoPath) continue;
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch (err) {
					console.warn("[project.remove] failed to remove worktree", {
						projectId: input.projectId,
						worktreePath: ws.worktreePath,
						err,
					});
				}
			}

			try {
				ctx.db
					.delete(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.run();
				ctx.db.delete(projects).where(eq(projects.id, input.projectId)).run();
			} catch (err) {
				console.warn("[project.remove] failed to delete local rows", {
					projectId: input.projectId,
					err,
				});
			}

			return { success: true, repoPath: localProject.repoPath };
		}),
});
