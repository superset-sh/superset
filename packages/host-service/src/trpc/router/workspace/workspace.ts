import { existsSync } from "node:fs";
import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import { destroyWorkspace } from "../workspace-cleanup";

export const workspaceRouter = router({
	get: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(({ ctx, input }) => {
			const localWorkspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.id) })
				.sync();

			if (!localWorkspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			return {
				...localWorkspace,
				worktreeExists: existsSync(localWorkspace.worktreePath),
			};
		}),

	cloudList: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.api.v2Workspace.list.query({
			organizationId: ctx.organizationId,
		});
		return rows.map((row) => ({
			id: row.id,
			projectId: row.projectId,
			branch: row.branch,
			hostId: row.hostId,
		}));
	}),

	// Persist an identity edit (rename / task link) to the local row so the
	// local-first list reflects it; the caller also mirrors to cloud presence.
	updateLocal: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				name: z.string().optional(),
				taskId: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const patch: { name?: string; taskId?: string | null } = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.taskId !== undefined) patch.taskId = input.taskId;
			if (Object.keys(patch).length > 0) {
				ctx.db
					.update(workspaces)
					.set(patch)
					.where(eq(workspaces.id, input.id))
					.run();
			}
			return { ok: true };
		}),

	// Local-first source of truth for this host's workspaces, shaped like the
	// cloud v2_workspaces row so the renderer collection can read it without
	// Electric. Legacy rows (pre-identity migration) coalesce to sane defaults.
	localList: protectedProcedure.query(({ ctx }) => {
		const hostId = getHostId();
		const rows = ctx.db.query.workspaces.findMany().sync();
		return rows.map((row) => {
			const createdAt = new Date(row.createdAt);
			return {
				id: row.id,
				organizationId: row.organizationId ?? ctx.organizationId,
				projectId: row.projectId,
				hostId,
				name: row.name ?? row.branch,
				branch: row.branch,
				type: row.type ?? "worktree",
				createdByUserId: row.createdByUserId ?? null,
				taskId: row.taskId ?? null,
				createdAt,
				updatedAt: createdAt,
			};
		});
	}),

	gitStatus: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const localWorkspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.id) })
				.sync();

			if (!localWorkspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const git = await ctx.git(localWorkspace.worktreePath);
			const status = await git.status();

			return {
				workspaceId: input.id,
				branch: status.current,
				files: status.files.map((f) => ({
					path: f.path,
					index: f.index,
					workingDir: f.working_dir,
				})),
				isClean: status.isClean(),
			};
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// Legacy external surface used by CLI/SDK/MCP. Preserve its
			// non-interactive contract while reusing the v2 cleanup path.
			return destroyWorkspace(ctx, {
				workspaceId: input.id,
				deleteBranch: false,
				force: true,
			});
		}),
});
