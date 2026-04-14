import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { runTeardown, type TeardownResult } from "../../../runtime/teardown";
import { disposeSessionsByWorkspaceId } from "../../../terminal/terminal";
import type { TeardownFailureCause } from "../../error-types";
import { protectedProcedure, router } from "../../index";

export const workspaceCleanupRouter = router({
	/**
	 * Destroy a workspace: terminals → teardown → worktree → branch → cloud → host row.
	 *
	 * Ordering matters. Each step is reversible (or a no-op) if the next fails
	 * until step 3 — past that, disk is gone and cloud cleanup becomes
	 * best-effort (warning instead of error).
	 *
	 * Typed errors for the renderer:
	 *   - CONFLICT             → git worktree refused (dirty tree); prompt `force: true`
	 *   - INTERNAL_SERVER_ERROR with `data.teardownFailure` → prompt `force: true`
	 *                            (force skips teardown)
	 */
	destroy: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				deleteBranch: z.boolean().default(false),
				force: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.api) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud API not configured",
				});
			}

			const local = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!local) {
				// Not on this host. Either already cleaned locally, or belongs to
				// another machine. Either way we don't touch cloud from here.
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace is not on this host",
				});
			}

			const project = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, local.projectId) })
				.sync();
			if (!project) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Project record missing for workspace",
				});
			}

			const warnings: string[] = [];

			// 1. Terminals. Kill before touching disk so user shells release
			//    locks the teardown script or git worktree remove may need.
			const killed = disposeSessionsByWorkspaceId(input.workspaceId, ctx.db);
			if (killed.failed > 0) {
				warnings.push(`${killed.failed} terminal(s) may still be running`);
			}

			// 2. Teardown script (skipped when forced — don't re-run a broken script).
			if (!input.force) {
				const teardown: TeardownResult = await runTeardown({
					db: ctx.db,
					workspaceId: input.workspaceId,
					worktreePath: local.worktreePath,
				});
				if (teardown.status === "failed") {
					const cause: TeardownFailureCause = {
						kind: "TEARDOWN_FAILED",
						exitCode: teardown.exitCode,
						signal: teardown.signal,
						timedOut: teardown.timedOut,
						outputTail: teardown.outputTail,
					};
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Teardown script failed",
						cause,
					});
				}
			}

			// 3. Worktree. Let git be the source of truth on "dirty" — if it
			//    refuses, surface CONFLICT so the client can prompt force: true.
			const git = await ctx.git(project.repoPath);
			let worktreeRemoved = false;
			try {
				await git.raw([
					"worktree",
					"remove",
					...(input.force ? ["--force"] : []),
					local.worktreePath,
				]);
				worktreeRemoved = true;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				// Idempotent: "not a working tree" / ENOENT → already gone.
				if (
					message.includes("is not a working tree") ||
					message.includes("No such file or directory") ||
					message.includes("ENOENT")
				) {
					warnings.push("Worktree was already missing on disk");
					worktreeRemoved = true;
				} else {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Worktree has uncommitted work or is locked",
						cause: err,
					});
				}
			}

			// 4. Branch. Optional; best-effort — failure is a warning, not an abort.
			let branchDeleted = false;
			if (input.deleteBranch && local.branch) {
				try {
					await git.raw(["branch", input.force ? "-D" : "-d", local.branch]);
					branchDeleted = true;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					warnings.push(`Failed to delete branch ${local.branch}: ${message}`);
				}
			}

			// 5. Cloud. Swallow failures — disk is already clean. Cloud self-heals
			//    via the user's next sync; worst case they re-run destroy.
			let cloudDeleted = false;
			try {
				await ctx.api.v2Workspace.delete.mutate({ id: input.workspaceId });
				cloudDeleted = true;
			} catch (err) {
				console.warn("[workspaceCleanup.destroy] cloud delete failed", {
					workspaceId: input.workspaceId,
					err,
				});
				warnings.push("Cloud delete pending; will retry on next sync");
			}

			// 6. Host sqlite.
			ctx.db
				.delete(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.run();

			return {
				success: true,
				worktreeRemoved,
				branchDeleted,
				cloudDeleted,
				warnings,
			};
		}),
});
