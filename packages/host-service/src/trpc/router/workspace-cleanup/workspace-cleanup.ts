import { existsSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invalidateLabelCache } from "../../../ports/static-ports";
import { runTeardown, type TeardownResult } from "../../../runtime/teardown";
import { disposeSessionsByWorkspaceId } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { deleteLocalWorkspace } from "../../../workspaces/local-workspace-store";
import type {
	DeleteInProgressCause,
	TeardownFailureCause,
} from "../../error-types";
import { protectedProcedure, router } from "../../index";
import {
	normalizeWorktreePath,
	parseWorktreeList,
} from "../workspace-creation/shared/worktree-list";
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

export interface DestroyWorkspaceInput {
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
	 * Destroy a workspace in five phases:
	 *
	 *   0. Preflight     — dirty-worktree check (skip if force)
	 *   1. Teardown      — run .superset/teardown.sh (skip if force)
	 *   2. Local cleanup — PTYs, worktree
	 *   3. Cloud delete  ← authoritative UI state
	 *   4. Branch delete — optional local branch cleanup
	 *   5. Host sqlite   — local index cleanup
	 *
	 * Worktree removal is intentionally before cloud delete. If it fails
	 * while the path still exists, the cloud row remains so the workspace is
	 * still visible and delete can be retried instead of orphaning disk state.
	 *
	 * Force semantics:
	 *   - skips preflight (step 0)
	 *   - skips teardown  (step 1)
	 *   - step 2b always uses `--force --force`
	 *   - step 4 always uses `-D` regardless: the `deleteBranch`
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
		.mutation(async ({ ctx, input }) => destroyWorkspace(ctx, input)),
});

export async function destroyWorkspace(
	ctx: HostServiceContext,
	input: DestroyWorkspaceInput,
) {
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
}

async function runDestroy(
	ctx: HostServiceContext,
	input: DestroyWorkspaceInput,
) {
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
	// case). Missing/broken local state is handled by the cleanup phase.
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
			repoPath: project.repoPath,
			projectId: local.projectId,
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

	// ─── Step 2: Local cleanup ─────────────────────────────────────
	// 2a. PTYs
	try {
		const killed = await disposeSessionsByWorkspaceId(
			input.workspaceId,
			ctx.db,
		);
		if (killed.failed > 0) {
			warnings.push(`${killed.failed} terminal(s) may still be running`);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		warnings.push(`Failed to dispose terminal sessions: ${message}`);
	}

	// 2b. Worktree. Double-force unlocks the rare locked-worktree case and
	//     clears stale metadata when the directory was manually removed.
	let worktreeRemoved = false;
	let branchDeleted = false;
	let git: Awaited<ReturnType<typeof ctx.git>> | null = null;
	if (local && !project) {
		worktreeRemoved = !existsSync(local.worktreePath);
		if (!worktreeRemoved) {
			warnings.push(
				`Skipped worktree removal at ${local.worktreePath}: project metadata is missing`,
			);
		}
	}
	if (local && project) {
		worktreeRemoved = !existsSync(local.worktreePath);
		try {
			git = await ctx.git(project.repoPath);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (!worktreeRemoved) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to open project repo at ${project.repoPath}: ${message}`,
				});
			}
			warnings.push(
				`Failed to open project repo at ${project.repoPath}: ${message}`,
			);
		}

		if (git) {
			// Remove against git's canonical path so a symlinked stored path
			// (macOS `/var` → `/private/var`) still matches its registration.
			const canonicalPath = normalizeWorktreePath(local.worktreePath);
			// Best-effort: we trust git's registry below, not the command's
			// exit text, which is locale- and version-dependent. `--force
			// --force` also unregisters a worktree whose directory is already
			// gone, so no separate prune (which would clobber other stale
			// worktrees' metadata) is needed.
			await git
				.raw(["worktree", "remove", "--force", "--force", canonicalPath])
				.catch(() => {});

			// A `worktree list` failure here means the post-remove state is
			// unknown — treat that like "still registered" and block rather
			// than risk orphaning disk past the cloud commit point.
			let stillRegistered = true;
			try {
				stillRegistered = await isRegisteredWorktree(git, local.worktreePath);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to verify worktree removal at ${local.worktreePath}: ${message}`,
				});
			}
			if (stillRegistered) {
				// git still tracks a live worktree here — removal genuinely
				// failed. Keep the cloud row so the workspace stays visible and
				// retryable instead of orphaning disk past the cloud commit point.
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to remove worktree at ${local.worktreePath}`,
				});
			}
			worktreeRemoved = true;
		}
	}

	// ─── Step 3: Local delete (authoritative) ─────────────────────
	// The local row is the commit point and the only record. The cloud
	// delete is best-effort legacy cleanup for rows mirrored before
	// workspaces went fully local.
	deleteLocalWorkspace(ctx, input.workspaceId);
	let cloudDeleted = false;
	try {
		await ctx.api.v2Workspace.delete.mutate({ id: input.workspaceId });
		cloudDeleted = true;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		warnings.push(
			`Legacy cloud cleanup failed (stale mirror row may remain): ${message}`,
		);
	}

	// ─── Step 4: Optional branch delete ────────────────────────────
	// After the local commit point so a failure here can't block the delete.
	if (git && local?.branch && input.deleteBranch) {
		try {
			// An absent ref (renamed, pruned, or never materialized) already
			// satisfies the goal, so skip the delete without a scary warning.
			// A thrown git failure falls through to the warning below rather
			// than being mistaken for "already gone".
			if (await localBranchExists(git, local.branch)) {
				await git.raw(["branch", "-D", local.branch]);
			}
			branchDeleted = true;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			warnings.push(`Failed to delete branch ${local.branch}: ${message}`);
		}
	}

	// ─── Step 5: Caches ────────────────────────────────────────────
	if (local) {
		try {
			invalidateLabelCache(input.workspaceId);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			warnings.push(`Failed to invalidate label cache: ${message}`);
		}
	}

	return {
		success: true,
		cloudDeleted,
		worktreeRemoved,
		branchDeleted,
		warnings,
	};
}

// Authoritative "is this still a worktree git tracks" check — reads git's own
// registry (realpath-canonicalized) instead of parsing remove's error text.
// Calls `git.raw` directly rather than the swallowing `listGitWorktrees` so a
// failed `worktree list` throws (state unknown) instead of looking empty.
async function isRegisteredWorktree(
	git: Awaited<ReturnType<HostServiceContext["git"]>>,
	worktreePath: string,
): Promise<boolean> {
	const target = normalizeWorktreePath(worktreePath);
	const raw = await git.raw(["worktree", "list", "--porcelain"]);
	return parseWorktreeList(raw).some(
		(w) => normalizeWorktreePath(w.path) === target,
	);
}

// `branch --list` exits 0 whether or not the branch exists (empty output when
// absent), so a thrown error is a real git failure — not a missing ref — and
// propagates instead of being misread as "already deleted".
async function localBranchExists(
	git: Awaited<ReturnType<HostServiceContext["git"]>>,
	branch: string,
): Promise<boolean> {
	const out = await git.raw(["branch", "--list", branch]);
	return out.trim().length > 0;
}
