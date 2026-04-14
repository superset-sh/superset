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
			const warnings: string[] = [];

			const local = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			const project = local
				? ctx.db.query.projects
						.findFirst({ where: eq(projects.id, local.projectId) })
						.sync()
				: undefined;

			if (!local) {
				// No host-sqlite row. This happens when the workspace was created
				// by a flow that didn't register it locally, or the host DB was
				// reset. We still want cloud cleanup to succeed — skip the
				// disk/PTY steps and flag what was skipped.
				warnings.push(
					"Workspace not tracked on this host; skipping terminal, teardown, worktree, and branch cleanup",
				);
			} else if (!project) {
				// Row exists but project is missing: can't resolve repoPath for
				// git ops. Skip disk steps but let terminals + cloud proceed.
				warnings.push(
					"Project record missing for workspace; skipping teardown and worktree removal",
				);
			}

			// 1. Terminals. Kill before touching disk so user shells release
			//    locks the teardown script or git worktree remove may need.
			const killed = disposeSessionsByWorkspaceId(input.workspaceId, ctx.db);
			if (killed.failed > 0) {
				warnings.push(`${killed.failed} terminal(s) may still be running`);
			}

			// 2. Teardown script (skipped when forced — don't re-run a broken
			//    script. Also skipped when we don't have a worktree path).
			if (!input.force && local && project) {
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
			let worktreeRemoved = false;
			if (local && project) {
				const git = await ctx.git(project.repoPath);
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

				// 4. Branch. Optional; best-effort — failure is a warning.
				if (input.deleteBranch && local.branch) {
					try {
						await git.raw(["branch", input.force ? "-D" : "-d", local.branch]);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						warnings.push(
							`Failed to delete branch ${local.branch}: ${message}`,
						);
					}
				}
			}
			const branchDeleted = Boolean(
				input.deleteBranch && local && project && worktreeRemoved,
			);

			// 5. Cloud. Swallow failures — disk is already clean. Cloud self-heals
			//    via the user's next sync; worst case they re-run destroy.
			let cloudDeleted = false;
			if (ctx.api) {
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
			} else {
				warnings.push("Cloud API unavailable; skipped cloud delete");
			}

			// 6. Host sqlite (no-op when the row was already missing).
			if (local) {
				ctx.db
					.delete(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.run();
			}

			return {
				success: true,
				worktreeRemoved,
				branchDeleted,
				cloudDeleted,
				warnings,
			};
		}),
});
