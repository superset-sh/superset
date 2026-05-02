import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { invalidateLabelCache } from "../../../ports/static-ports";
import { runTeardown, type TeardownResult } from "../../../runtime/teardown";
import { disposeSessionsByWorkspaceId } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import type {
	DeleteInProgressCause,
	TeardownFailureCause,
} from "../../error-types";
import { protectedProcedure, router } from "../../index";
import { isMainWorkspace } from "./is-main-workspace";

/**
 * Process-local guard against concurrent destroys of the same workspace.
 * A second caller observes the live entry and gets a typed CONFLICT (with
 * `DELETE_IN_PROGRESS` cause) so the renderer can render a toast instead
 * of mistaking it for a dirty-worktree race and silently force-retrying.
 *
 * Doesn't survive a host-service crash mid-delete — but neither does the
 * destroy itself, and the saga is idempotent enough that a second attempt
 * after restart is safe.
 */
const destroysInFlight = new Set<string>();

/** @internal — exposed for tests to introspect / clear the guard. */
export const __testDestroysInFlight = destroysInFlight;

interface DestroyInput {
	workspaceId: string;
	deleteBranch: boolean;
	force: boolean;
}

/**
 * Discriminated so the renderer can't accidentally treat
 * `{ canDelete: false, reason: null }` as a no-op — it's an unrepresentable
 * combination at the type level.
 */
type InspectResult =
	| {
			canDelete: true;
			reason: null;
			hasChanges: boolean;
			hasUnpushedCommits: boolean;
	  }
	| {
			canDelete: false;
			reason: string;
			hasChanges: false;
			hasUnpushedCommits: false;
	  };

export const workspaceCleanupRouter = router({
	/**
	 * Status preview for the v2 delete dialog. Co-located with `destroy` so
	 * the two can never disagree about what's blocked vs warned.
	 *
	 * Contract:
	 *   - canDelete: false      → render `reason` as a blocking banner.
	 *   - hasChanges/Unpushed   → render as warnings; user can still confirm.
	 *   - git failures (missing worktree, broken repo) → return as canDelete
	 *     with no warnings; the destroy saga handles those states best-effort.
	 *
	 * Unpushed-commit detection uses `rev-list --not --remotes` so brand-new
	 * branches with no upstream still report unpushed commits correctly.
	 */
	inspect: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }): Promise<InspectResult> => {
			const main = await isMainWorkspace(ctx, input.workspaceId);
			if (main.isMain) {
				return {
					canDelete: false,
					reason: main.reason,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}

			const { local } = main;
			if (!local) {
				return {
					canDelete: true,
					reason: null,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}

			try {
				const git = await ctx.git(local.worktreePath);
				const status = await git.status();
				let hasUnpushedCommits = false;
				try {
					const result = await git.raw([
						"rev-list",
						"--count",
						"HEAD",
						"--not",
						"--remotes",
					]);
					const count = Number.parseInt(result.trim(), 10);
					hasUnpushedCommits = Number.isFinite(count) && count > 0;
				} catch {
					// Leave false — `rev-list` failure isn't a signal we can act on.
				}
				return {
					canDelete: true,
					reason: null,
					hasChanges: !status.isClean(),
					hasUnpushedCommits,
				};
			} catch {
				return {
					canDelete: true,
					reason: null,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}
		}),

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
	 *   - CONFLICT             → dirty worktree; prompt force-retry.
	 *                            CONFLICT with `data.deleteInProgress` is a
	 *                            different beast — another destroy is in
	 *                            flight for the same workspace; surface as
	 *                            a toast and do NOT force-retry.
	 *   - INTERNAL_SERVER_ERROR with `data.teardownFailure` → teardown
	 *                            script failed; prompt force-retry
	 *   - BAD_REQUEST          → main workspace; cannot be deleted
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
			if (destroysInFlight.has(input.workspaceId)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Deletion already in progress for this workspace",
					cause: { kind: "DELETE_IN_PROGRESS" } satisfies DeleteInProgressCause,
				});
			}
			destroysInFlight.add(input.workspaceId);
			try {
				return await runDestroy(ctx, input);
			} finally {
				destroysInFlight.delete(input.workspaceId);
			}
		}),
});

async function runDestroy(ctx: HostServiceContext, input: DestroyInput) {
	const warnings: string[] = [];

	// `isMainWorkspace` already loads workspace + project rows from sqlite;
	// thread them through to avoid duplicate sync queries downstream.
	const main = await isMainWorkspace(ctx, input.workspaceId);
	if (main.isMain) {
		throw new TRPCError({ code: "BAD_REQUEST", message: main.reason });
	}
	const { local, project } = main;

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
	try {
		const killed = disposeSessionsByWorkspaceId(input.workspaceId, ctx.db);
		if (killed.failed > 0) {
			warnings.push(`${killed.failed} terminal(s) may still be running`);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		warnings.push(`Failed to dispose terminal sessions: ${message}`);
	}

	// 3b. Worktree (always --force: we're past the commit point)
	// 3c. Optional branch delete
	let worktreeRemoved = false;
	let branchDeleted = false;
	if (local && project) {
		// Past the commit point — every failure here is a warning, including
		// failure to even open the repo. Letting `ctx.git` escape would surface
		// as a hard error for a workspace that's already been deleted in cloud.
		let git: Awaited<ReturnType<typeof ctx.git>> | null = null;
		try {
			git = await ctx.git(project.repoPath);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			warnings.push(
				`Failed to open project repo at ${project.repoPath}: ${message}`,
			);
		}

		if (git) {
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
					warnings.push(`Failed to delete branch ${local.branch}: ${message}`);
				}
			}
		}
	}

	// 3d. Host sqlite row
	if (local) {
		try {
			ctx.db
				.delete(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.run();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			warnings.push(
				`Failed to remove local workspace row for ${input.workspaceId}: ${message}`,
			);
		}
		try {
			invalidateLabelCache(input.workspaceId);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			warnings.push(`Failed to invalidate label cache: ${message}`);
		}
	}

	return {
		success: true,
		cloudDeleted: true,
		worktreeRemoved,
		branchDeleted,
		warnings,
	};
}
