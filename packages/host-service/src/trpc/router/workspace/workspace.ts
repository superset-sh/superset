import { existsSync } from "node:fs";
import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
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

	// All org workspaces from cloud, shaped like a v2_workspaces row. Used as
	// cross-host *presence* — the renderer merges this (for other hosts) with the
	// local list, so remote-machine workspaces stay visible without Electric.
	cloudList: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.api.v2Workspace.list.query({
			organizationId: ctx.organizationId,
		});
		return rows.map((row) => {
			const createdAt = new Date(row.createdAt);
			return {
				id: row.id,
				organizationId: ctx.organizationId,
				projectId: row.projectId,
				hostId: row.hostId,
				name: row.name,
				branch: row.branch,
				type: row.type,
				// Coalesced for cloud APIs that predate these list columns.
				createdByUserId: row.createdByUserId ?? null,
				taskId: row.taskId ?? null,
				createdAt,
				updatedAt: createdAt,
			};
		});
	}),

	// Persist an identity edit (rename / task link / branch rename) to the local
	// row so the local-first list reflects it; the caller also mirrors to cloud
	// presence. Only this host's workspaces have a local row.
	updateLocal: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				name: z.string().optional(),
				taskId: z.string().nullable().optional(),
				branch: z.string().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const patch: { name?: string; taskId?: string | null; branch?: string } =
				{};
			if (input.name !== undefined) patch.name = input.name;
			if (input.taskId !== undefined) patch.taskId = input.taskId;
			if (input.branch !== undefined) patch.branch = input.branch;
			if (Object.keys(patch).length === 0) {
				return { ok: true };
			}
			const result = ctx.db
				.update(workspaces)
				.set(patch)
				.where(
					and(
						eq(workspaces.id, input.id),
						or(
							eq(workspaces.organizationId, ctx.organizationId),
							isNull(workspaces.organizationId),
						),
					),
				)
				.run();
			if (result.changes === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No local workspace ${input.id} on this host`,
				});
			}
			return { ok: true };
		}),

	// Local-first source of truth for this host's workspaces, shaped like the
	// cloud v2_workspaces row so the renderer collection can read it without
	// Electric. Scoped to the host's org; legacy rows (pre-identity migration,
	// null org) are treated as this org and coalesce to sane defaults.
	localList: protectedProcedure.query(({ ctx }) => {
		const hostId = getHostId();
		const rows = ctx.db.query.workspaces
			.findMany({
				where: or(
					eq(workspaces.organizationId, ctx.organizationId),
					isNull(workspaces.organizationId),
				),
			})
			.sync();
		const repoPathByProjectId = new Map(
			ctx.db.query.projects
				.findMany()
				.sync()
				.map((p) => [p.id, p.repoPath]),
		);
		return rows.map((row) => {
			const createdAt = new Date(row.createdAt);
			// Legacy main rows predate the type column but were inserted with
			// worktreePath === the project's repoPath (see isMainWorkspace).
			const fallbackType =
				row.worktreePath === repoPathByProjectId.get(row.projectId)
					? "main"
					: "worktree";
			return {
				id: row.id,
				organizationId: row.organizationId ?? ctx.organizationId,
				projectId: row.projectId,
				hostId,
				name: row.name ?? row.branch,
				branch: row.branch,
				type: row.type ?? fallbackType,
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
