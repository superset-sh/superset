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
	 * Destroy a workspace in three phases:
	 *
	 *   0. Preflight     — dirty-worktree check (skip if force)
	 *   1. Teardown      — run .superset/teardown.sh (skip if force)
	 *   2. Cloud delete  ← COMMIT POINT — throws if it fails
	 *   3. Local cleanup — PTYs, worktree, branch, host sqlite (best-effort)
	 *
	 * Any failure in phases 0–2 leaves the workspace fully intact. Failures
	 * in phase 3 become warnings — local orphans are cheap, and the user
	 * has a toast telling them what was left behind.
	 *
	 * Force semantics:
	 *   - skips preflight (step 0)
	 *   - skips teardown  (step 1)
	 *   - step 3b always uses `--force` (we're past the commit point)
	 *   - step 3c always uses `-D` regardless: the `deleteBranch`
	 *     checkbox is the user's consent, so refusing unmerged branches
	 *     would just silently drop the opt-in.
	 *
	 * Typed errors for the renderer:
	 *   - CONFLICT             → dirty worktree; prompt force-retry
	 *   - INTERNAL_SERVER_ERROR with `data.teardownFailure` → teardown
	 *                            script failed; prompt force-retry
	 *   - PRECONDITION_FAILED  → no cloud API configured
	 *   - pass-through         → cloud auth / network failure
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

			// ─── Step 0: Preflight ─────────────────────────────────────────
			// Block only on dirty worktree (the common "I forgot to commit"
			// case). Anything else the local-cleanup phase handles as warning.
			if (!input.force && local && project) {
				try {
					const git = await ctx.git(local.worktreePath);
					const status = await git.status();
					if (!status.isClean()) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "Worktree has uncommitted changes",
						});
					}
				} catch (err) {
					if (err instanceof TRPCError) throw err;
					// Can't read status (missing worktree dir, etc.) — not a
					// conflict. Continue; step 3b will skip idempotently.
				}
			}

			// ─── Step 1: Teardown ──────────────────────────────────────────
			// Script is the user's last chance to stop services / flush state
			// before the workspace goes away. Failure here is recoverable
			// via force-retry, which skips this step.
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

			// ─── Step 2: Cloud delete (commit point) ───────────────────────
			// Past this line, the workspace is gone from the user's perspective
			// (sidebar will reflect the cloud state). Local artifacts become
			// cleanup debris — never a source of truth.
			if (!ctx.api) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud API not configured",
				});
			}
			await ctx.api.v2Workspace.delete.mutate({ id: input.workspaceId });

			// ─── Step 3: Local cleanup (best-effort) ───────────────────────
			// Every failure in this phase is captured as a warning; the
			// caller always sees success.

			// 3a. PTYs
			const killed = disposeSessionsByWorkspaceId(input.workspaceId, ctx.db);
			if (killed.failed > 0) {
				warnings.push(`${killed.failed} terminal(s) may still be running`);
			}

			// 3b. Worktree (always --force: we're past the commit point)
			// 3c. Optional branch delete
			let worktreeRemoved = false;
			let branchDeleted = false;
			if (local && project) {
				const git = await ctx.git(project.repoPath);
				try {
					await git.raw(["worktree", "remove", "--force", local.worktreePath]);
					worktreeRemoved = true;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					if (
						message.includes("is not a working tree") ||
						message.includes("No such file or directory") ||
						message.includes("ENOENT")
					) {
						worktreeRemoved = true;
					} else {
						warnings.push(
							`Failed to remove worktree at ${local.worktreePath}: ${message}`,
						);
					}
				}

				if (input.deleteBranch && local.branch) {
					try {
						await git.raw(["branch", "-D", local.branch]);
						branchDeleted = true;
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						warnings.push(
							`Failed to delete branch ${local.branch}: ${message}`,
						);
					}
				}
			}

			// 3d. Host sqlite row
			if (local) {
				ctx.db
					.delete(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.run();
			}

			return {
				success: true,
				cloudDeleted: true,
				worktreeRemoved,
				branchDeleted,
				warnings,
			};
		}),
});
