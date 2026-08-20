import { existsSync } from "node:fs";
import { basename } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import {
	getLocalWorkspace,
	getTagsByWorkspaceId,
	normalizeWorkspaceTags,
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
			const tagsByWorkspaceId = getTagsByWorkspaceId(
				ctx.db,
				rows.map((row) => row.id),
			);
			return rows.map((row) => ({
				...toCloudShape(row, ctx.organizationId),
				worktreePath: row.worktreePath,
				parentWorkspaceId: row.parentWorkspaceId,
				tags: tagsByWorkspaceId.get(row.id) ?? [],
				// Tombstones' worktrees are gone by definition; stat-checking an
				// unbounded, forever-growing archive on every poll adds up.
				worktreeExists:
					row.archivedAt == null ? existsSync(row.worktreePath) : false,
				projectName: row.projectId
					? (projectNameById.get(row.projectId) ?? null)
					: null,
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
				// Replace-all tag set; normalized server-side.
				tags: z.array(z.string()).max(64).optional(),
				parentWorkspaceId: z.string().uuid().nullable().optional(),
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
				parentWorkspaceId?: string | null;
				tags?: string[];
			} = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.branch !== undefined) patch.branch = input.branch;
			if (input.taskId !== undefined) patch.taskId = input.taskId;
			// Re-parenting is an explicit correction, so unlike create's
			// ambient env inference every invalid target errors loudly instead
			// of silently recording nothing.
			if (input.parentWorkspaceId !== undefined) {
				if (current.type === "main") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "The local workspace cannot be nested under another",
					});
				}
				if (input.parentWorkspaceId !== null) {
					if (input.parentWorkspaceId === input.id) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "A workspace cannot be its own parent",
						});
					}
					const parent = getLocalWorkspace(ctx.db, input.parentWorkspaceId);
					if (!parent || parent.archivedAt != null) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Parent workspace not found: ${input.parentWorkspaceId}`,
						});
					}
					if (parent.projectId !== current.projectId) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Parent workspace belongs to a different project",
						});
					}
					// Walk the proposed parent's ancestor chain: reaching this
					// workspace means the move would close a cycle. The visited
					// set terminates the walk even if the DB already holds one.
					const visited = new Set<string>();
					let ancestor: string | null = parent.parentWorkspaceId;
					while (ancestor !== null && !visited.has(ancestor)) {
						if (ancestor === input.id) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "Cannot move a workspace under its own descendant",
							});
						}
						visited.add(ancestor);
						ancestor =
							getLocalWorkspace(ctx.db, ancestor)?.parentWorkspaceId ?? null;
					}
				}
				patch.parentWorkspaceId = input.parentWorkspaceId;
			}
			if (input.tags !== undefined) {
				patch.tags = normalizeWorkspaceTags(input.tags);
			}
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
				parentWorkspaceId: updated.parentWorkspaceId,
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
