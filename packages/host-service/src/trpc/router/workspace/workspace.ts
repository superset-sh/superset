import { existsSync } from "node:fs";
import { basename } from "node:path";
import { workspaceTagsInputSchema } from "@superset/shared/workspace-tags";
import { TRPCError } from "@trpc/server";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import {
	getWorkspaceTags,
	getWorkspaceTagsByWorkspaceId,
	toCloudShape,
	updateLocalWorkspace,
} from "../../../workspaces/local-workspace-store";
import { protectedProcedure, router } from "../../index";
import { resolveWorktreePath } from "../git/utils/resolve-worktree";
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
	 * Archived (tombstoned) rows are excluded unless the caller opts in —
	 * only the workspaces board does, for its Merged/Deleted columns.
	 */
	list: protectedProcedure
		.input(z.object({ includeArchived: z.boolean().default(false) }).optional())
		.query(({ ctx, input }) => {
			const rows = input?.includeArchived
				? ctx.db.select().from(workspaces).all()
				: ctx.db
						.select()
						.from(workspaces)
						.where(isNull(workspaces.archivedAt))
						.all();
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
			// Tags are the caller's own: on a shared host each user files the
			// same workspaces into their own folders.
			const tagsByWorkspaceId = getWorkspaceTagsByWorkspaceId(
				ctx.db,
				rows.map((row) => row.id),
				ctx.userId,
			);
			return rows.map((row) => ({
				...toCloudShape(row, ctx.organizationId),
				tags: tagsByWorkspaceId.get(row.id) ?? [],
				worktreePath: row.worktreePath,
				// Tombstones' worktrees are gone by definition; stat-checking an
				// unbounded, forever-growing archive on every poll adds up.
				worktreeExists:
					row.archivedAt == null ? existsSync(row.worktreePath) : false,
				projectName: row.projectId
					? (projectNameById.get(row.projectId) ?? null)
					: null,
				// Host-only: the frozen cloud shape never had an activity signal.
				lastActivityAt: row.lastActivityAt,
				archivedAt: row.archivedAt,
				archiveReason: row.archiveReason,
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
				tags: workspaceTagsInputSchema.optional(),
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
			const patch: {
				name?: string;
				branch?: string;
				taskId?: string | null;
				tags?: string[];
			} = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.branch !== undefined) patch.branch = input.branch;
			if (input.taskId !== undefined) patch.taskId = input.taskId;
			if (input.tags !== undefined) patch.tags = input.tags;
			if (Object.keys(patch).length === 0) {
				return {
					...toCloudShape(current, ctx.organizationId),
					tags: getWorkspaceTags(ctx.db, current.id, ctx.userId),
				};
			}
			const updated = updateLocalWorkspace(
				{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
				input.id,
				patch,
			);
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			// Linking a task to a workspace starts work on it — move it to
			// In Progress. Best-effort cloud call; the update never blocks.
			if (typeof input.taskId === "string") {
				const taskId = input.taskId;
				void ctx.api.task.start.mutate({ id: taskId }).catch((err) => {
					console.warn(
						`[workspace.update] failed to mark task ${taskId} as started:`,
						err,
					);
				});
			}
			return {
				...toCloudShape(updated, ctx.organizationId),
				tags: getWorkspaceTags(ctx.db, updated.id, ctx.userId),
			};
		}),

	// Workspaces are host-owned now; the cloud list it proxied is gone. Kept as
	// an empty read so released clients that still call it don't error.
	gitStatus: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.id);
			const git = await ctx.git(worktreePath);
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
			// non-interactive contract while reusing the v2 cleanup path:
			// force covers the git semantics (no dirty-worktree prompt), but
			// teardown still runs — a failure lands in `warnings` since there
			// is nobody to prompt for a force-retry (#6174).
			return destroyWorkspace(ctx, {
				workspaceId: input.id,
				deleteBranch: false,
				force: true,
				teardownMode: "best-effort",
			});
		}),
});
