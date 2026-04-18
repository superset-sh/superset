import { rmSync } from "node:fs";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	createFromClone,
	createFromImportLocal,
	setupFromClone,
	setupFromImport,
} from "./handlers";
import { deleteHostBacking } from "./utils/persist-project";
import { resolveWithPrimaryRemote } from "./utils/resolve-repo";

export const projectRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.db
			.select({ id: projects.id, repoPath: projects.repoPath })
			.from(projects)
			.all();
	}),

	findByPath: protectedProcedure
		.input(z.object({ repoPath: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const { parsed } = await resolveWithPrimaryRemote(input.repoPath);
			const { candidates } = await ctx.api.v2Project.findByRemote.query({
				repoCloneUrl: parsed.url,
			});
			return { candidates };
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				visibility: z.enum(["private", "public"]),
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
				case "template":
					throw new TRPCError({
						code: "NOT_IMPLEMENTED",
						message: `project.create mode="${input.mode.kind}" is not implemented yet`,
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
				// Required when a host-service.projects row already exists for this
				// projectId and we'd be re-pointing `repoPath`. Re-pointing can
				// invalidate existing workspace rows under the project; the client
				// confirms it has explained that to the user.
				acknowledgeWorkspaceInvalidation: z.boolean().optional(),
				mode: z.discriminatedUnion("kind", [
					z.object({
						kind: z.literal("clone"),
						parentDir: z.string().min(1),
					}),
					z.object({
						kind: z.literal("import"),
						repoPath: z.string().min(1),
					}),
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existing = ctx.db
				.select({ id: projects.id })
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (existing && !input.acknowledgeWorkspaceInvalidation) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"Project is already set up on this host. Re-pointing the path can invalidate existing workspaces — call again with acknowledgeWorkspaceInvalidation: true to proceed.",
				});
			}

			const cloudProject = await ctx.api.v2Project.get.query({
				organizationId: ctx.organizationId,
				id: input.projectId,
			});
			if (!cloudProject.repoCloneUrl) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Project has no linked GitHub repository — cannot set up",
				});
			}
			const expectedParsed = parseGitHubRemote(cloudProject.repoCloneUrl);
			if (!expectedParsed) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Could not parse GitHub remote from ${cloudProject.repoCloneUrl}`,
				});
			}

			const setup = {
				ctx,
				projectId: input.projectId,
				cloudRepoCloneUrl: cloudProject.repoCloneUrl,
				expectedSlug: `${expectedParsed.owner}/${expectedParsed.name}`,
			};
			switch (input.mode.kind) {
				case "clone":
					return setupFromClone(setup, { parentDir: input.mode.parentDir });
				case "import":
					return setupFromImport(setup, { repoPath: input.mode.repoPath });
			}
		}),

	// TODO: remove
	remove: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();
			if (!localProject) return { success: true };

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
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
				rmSync(localProject.repoPath, { recursive: true, force: true });
			} catch (err) {
				console.warn("[project.remove] failed to remove repo dir", {
					projectId: input.projectId,
					repoPath: localProject.repoPath,
					err,
				});
			}

			ctx.db.delete(projects).where(eq(projects.id, input.projectId)).run();
			await deleteHostBacking(ctx, input.projectId);

			return { success: true };
		}),
});
