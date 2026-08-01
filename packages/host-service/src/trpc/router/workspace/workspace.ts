import { existsSync } from "node:fs";
import { basename } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import {
	toCloudShape,
	updateLocalWorkspace,
} from "../../../workspaces/local-workspace-store";
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

	/**
	 * Authoritative list of this host's workspaces, served entirely from
	 * host.db — works with zero cloud availability. Rows are shaped like
	 * cloud rows (plus local extras) so consumers of either read path agree.
	 */
	list: protectedProcedure.query(({ ctx }) => {
		const rows = ctx.db.select().from(workspaces).all();
		const projectNameById = new Map(
			ctx.db
				.select({
					id: projects.id,
					name: projects.name,
					repoPath: projects.repoPath,
				})
				.from(projects)
				.all()
				.map((project) => [
					project.id,
					project.name || basename(project.repoPath),
				]),
		);
		return rows.map((row) => ({
			...toCloudShape(row, ctx.organizationId),
			worktreePath: row.worktreePath,
			worktreeExists: existsSync(row.worktreePath),
			projectName: projectNameById.get(row.projectId) ?? null,
		}));
	}),

	/**
	 * Rename / branch-repoint / task-link update, local-first: the host.db
	 * row commits and broadcasts immediately; the cloud mirror push is
	 * best-effort (the reconciler retries when unreachable). `branch` only
	 * re-points the record — callers rename the git branch themselves.
	 */
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				branch: z.string().min(1).optional(),
				taskId: z.string().uuid().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const current = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.id) })
				.sync();
			if (!current) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (input.name !== undefined && current.type === "main") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						'The local workspace cannot be renamed — it always displays as "local".',
				});
			}
			const patch: { name?: string; branch?: string; taskId?: string | null } =
				{};
			if (input.name !== undefined) patch.name = input.name;
			if (input.branch !== undefined) patch.branch = input.branch;
			if (input.taskId !== undefined) patch.taskId = input.taskId;
			if (Object.keys(patch).length === 0) {
				return toCloudShape(current, ctx.organizationId);
			}
			const updated = updateLocalWorkspace(
				{ db: ctx.db, eventBus: ctx.eventBus },
				input.id,
				patch,
			);
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			return toCloudShape(updated, ctx.organizationId);
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
