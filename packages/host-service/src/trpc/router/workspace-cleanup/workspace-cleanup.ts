import { existsSync, lstatSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";
import { TRPCError } from "@trpc/server";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { pullRequests, workspaces } from "../../../db/schema";
import { invalidateLabelCache } from "../../../ports/static-ports";
import { coercePullRequestState } from "../../../runtime/pull-requests/utils/pull-request-mappers";
import {
	removeDevAppProfile,
	runTeardown,
	type TeardownResult,
} from "../../../runtime/teardown";
import { disposeSessionsByWorkspaceId } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import type { GitTaskEnv } from "../../../workers/tasks/git";
import {
	archiveLocalWorkspace,
	trackWorkspaceDeleted,
	unarchiveLocalWorkspace,
} from "../../../workspaces/local-workspace-store";
import type {
	DeleteInProgressCause,
	TeardownFailureCause,
} from "../../error-types";
import { protectedProcedure, router } from "../../index";
import { getHostWorktreeBaseDir } from "../settings/worktree-location";
import { isInsideSessionsRoot } from "../workspace-creation/shared/session-paths";
import { isInsideProjectWorktreesRoot } from "../workspace-creation/shared/worktree-paths";
import { cleanupGitOps, isIndeterminateGitTaskFailure } from "./git-ops";
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
	/**
	 * Teardown (step 2) behavior — deliberately separate from `force`, which
	 * only carries the destructive git semantics (skip preflight, double-force
	 * worktree removal):
	 *   - "blocking":    a failed script throws PRECONDITION_FAILED so an
	 *                    interactive caller can prompt a force-retry.
	 *   - "best-effort": always runs; a failure degrades to a warning. For
	 *                    non-interactive callers (CLI/SDK/MCP) with nobody to
	 *                    prompt — skipping instead would leak the resources the
	 *                    script provisions (#6174).
	 *   - "skip":        don't run — the interactive force-retry contract.
	 */
	teardownMode: "blocking" | "best-effort" | "skip";
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
	 * The git reads run in the host worker pool (gitWorktreeStateTask) so a
	 * slow status on a large worktree can't block the event loop.
	 */
	inspect: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input, signal }): Promise<InspectResult> => {
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
				const gitEnv = await cleanupGitOps.resolveGitEnv(
					ctx,
					local.worktreePath,
				);
				const state = await cleanupGitOps.readWorktreeState(
					{
						worktreePath: local.worktreePath,
						gitEnv,
						ignoreInitialCommit: local.type === "session",
					},
					signal,
				);
				return {
					canDelete: true,
					reason: null,
					hasChanges: state.hasChanges,
					hasUnpushedCommits: state.hasUnpushedCommits,
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
	 * Destroy a workspace in phases:
	 *
	 *   0.   Archive      ← the commit point, FIRST: the row tombstones
	 *                       (archivedAt/archiveReason) and vanishes from
	 *                       default lists before any slow work, so the
	 *                       delete feels instant in every client
	 *   1.   Preflight    — dirty-worktree check (skip if force)
	 *   2.   Teardown     — run .superset/teardown.sh (per teardownMode)
	 *   3.   Local cleanup — PTYs, worktree
	 *   4.   Branch delete — optional local branch cleanup
	 *   5.   Caches
	 *
	 * A thrown failure — preflight conflict, blocking teardown, or the
	 * unrecoverable parts of step 3 — un-archives the row so the workspace
	 * reappears and stays retryable instead of orphaning disk state.
	 * Steps 4-5 (and the tolerated parts of step 3) degrade to warnings on
	 * a still-successful delete, and telemetry fires on that success. A
	 * crash after the archive is finished by the startup reconciler
	 * (runArchivedWorkspaceReconcile) with best-effort teardown.
	 *
	 * Force semantics (git only; teardown is governed by teardownMode):
	 *   - skips preflight (step 1)
	 *   - step 3b always uses `--force --force`
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
	 *   - PRECONDITION_FAILED with `data.teardownFailure` → teardown
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
				// Consent to NOT run the teardown script — set only by the
				// teardown-failed retry. Deliberately a separate flag from
				// `force`, which carries only the git-destructive consent
				// (dirty worktree / unpushed commits): a warned "Delete
				// anyway" must still run teardown, otherwise editing any
				// tracked file silently disables the user's cleanup script.
				skipTeardown: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) =>
			destroyWorkspace(ctx, {
				workspaceId: input.workspaceId,
				deleteBranch: input.deleteBranch,
				force: input.force,
				teardownMode: input.skipTeardown ? "skip" : "blocking",
			}),
		),
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

	// ─── Step 0: Archive (the commit point) ────────────────────────
	// FIRST, before any slow work (git preflight, teardown script): the
	// tombstone is a durable delete-intent record, and its broadcast is
	// what drops the row from every list — archiving up front is what
	// makes the delete feel instant. If the host crashes mid-cleanup the
	// startup reconciler finishes the job with best-effort teardown. ANY
	// failure below un-archives so the workspace reappears live and
	// retryable. The renderer's delete dialog is globally mounted (not
	// under the row) so a teardown-failure prompt survives the row
	// vanishing here. Sessions tombstone too — they're workspaces with
	// a little missing data (no project, no PRs; reason is always
	// "deleted"), and session folder names are claimed against ALL rows
	// including tombstones, so a tombstone's path can't be reused.
	const marked = local != null;
	if (marked) {
		archiveLocalWorkspace(ctx, input.workspaceId, archiveReasonFor(ctx, local));
	}

	try {
		// ─── Step 1: Preflight ─────────────────────────────────────
		// Block only on dirty worktree (the common "I forgot to commit"
		// case). Missing/broken local state is handled by the cleanup phase.
		// Sessions are standalone repos — the same dirty check applies even
		// though they have no project row.
		if (!input.force && local && (project || local.type === "session")) {
			try {
				const gitEnv = await cleanupGitOps.resolveGitEnv(
					ctx,
					local.worktreePath,
				);
				const state = await cleanupGitOps.readWorktreeState({
					worktreePath: local.worktreePath,
					gitEnv,
				});
				if (state.hasChanges) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Worktree has uncommitted changes",
					});
				}
			} catch (err) {
				if (err instanceof TRPCError) throw err;
				if (isIndeterminateGitTaskFailure(err)) {
					// Timeout/pool failure: dirty-state is UNKNOWN. Fail closed on
					// this destructive path rather than silently skipping the
					// dirty-worktree block — a retry usually succeeds (the first
					// attempt warmed the FS cache), and force skips preflight
					// entirely as the explicit escape hatch.
					const message = err instanceof Error ? err.message : String(err);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Couldn't verify worktree state at ${local.worktreePath}: ${message}`,
					});
				}
				// Can't read status (missing worktree dir, etc.) — not a
				// conflict. Continue; step 3b will skip idempotently.
			}
		}

		// ─── Step 2: Teardown ──────────────────────────────────────
		// Script is the user's last chance to stop services / flush state
		// before the workspace goes away. Runs after the archive so the
		// (potentially slow) script never delays the row leaving the UI; a
		// blocking failure throws, the catch below un-archives, and the
		// globally-mounted dialog re-opens with a force-retry.
		if (input.teardownMode !== "skip" && local && project) {
			const teardown: TeardownResult = await runTeardown({
				db: ctx.db,
				workspaceId: input.workspaceId,
				worktreePath: local.worktreePath,
				repoPath: project.repoPath,
				projectId: project.id,
			});
			if (teardown.status === "failed") {
				if (input.teardownMode === "blocking") {
					const cause: TeardownFailureCause = {
						kind: "TEARDOWN_FAILED",
						exitCode: teardown.exitCode,
						signal: teardown.signal,
						timedOut: teardown.timedOut,
						outputTail: teardown.outputTail,
					};
					// Recoverable via force-retry — an expected user-script failure, not a
					// service bug; must not be reported as a 500.
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "Teardown script failed",
						cause,
					});
				}
				warnings.push(formatTeardownWarning(teardown));
			}
		}

		const result = await runDestroyPhases(ctx, input, {
			local,
			project,
			warnings,
		});
		// Telemetry at the true commit: a failed destroy un-archives below and
		// must not count, and a retried destroy must count exactly once.
		if (marked && local) trackWorkspaceDeleted(ctx, local);
		return result;
	} catch (err) {
		if (marked) unarchiveLocalWorkspace(ctx, input.workspaceId);
		throw err;
	}
}

/** "merged" when the linked PR was observed merged; every other delete —
 * open/closed/draft PR or none at all — is a plain "deleted". */
/** existsSync also answers false for a path that exists but cannot be read;
 * this answers true only when the path is really absent. */
function isMissingDirectory(path: string): boolean {
	try {
		return statSync(path, { throwIfNoEntry: false }) === undefined;
	} catch {
		return false;
	}
}

/** Like isMissingDirectory, but does not follow a final symlink: a dangling
 * link at the worktree path is still an entry to remove, not an absence. */
function isMissingPath(path: string): boolean {
	try {
		return lstatSync(path, { throwIfNoEntry: false }) === undefined;
	} catch {
		return false;
	}
}

function archiveReasonFor(
	ctx: HostServiceContext,
	local: { pullRequestId: string | null },
): "merged" | "deleted" {
	if (!local.pullRequestId) return "deleted";
	try {
		const pr = ctx.db.query.pullRequests
			.findFirst({ where: eq(pullRequests.id, local.pullRequestId) })
			.sync();
		return coercePullRequestState(pr?.state ?? null) === "merged"
			? "merged"
			: "deleted";
	} catch (err) {
		// A reason lookup failure must never block the delete — but a merged
		// workspace misfiled under Deleted deserves a trace.
		console.warn("[workspace-cleanup] archive reason lookup failed", {
			pullRequestId: local.pullRequestId,
			err,
		});
		return "deleted";
	}
}

async function runDestroyPhases(
	ctx: HostServiceContext,
	input: DestroyWorkspaceInput,
	{
		local,
		project,
		warnings,
	}: {
		local: Awaited<ReturnType<typeof isMainWorkspace>>["local"];
		project: Awaited<ReturnType<typeof isMainWorkspace>>["project"];
		warnings: string[];
	},
) {
	// ─── Step 3: Local cleanup ─────────────────────────────────────
	// 3a. PTYs
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

	// 3b. Worktree. Double-force unlocks the rare locked-worktree case and
	//     clears stale metadata when the directory was manually removed.
	//     Runs in the worker pool: the removal is a recursive delete of the
	//     whole worktree directory, which would otherwise stall the loop.
	let worktreeRemoved = false;
	let branchDeleted = false;
	let repoGitEnv: GitTaskEnv | null = null;
	if (local?.type === "session") {
		// Sessions are standalone repos in the managed sessions root — no
		// `git worktree remove`, just delete the folder. The root guard is
		// load-bearing: a corrupt worktreePath must never point rm -rf at
		// user data, so anything outside the root is left on disk (warned)
		// while the row delete proceeds.
		worktreeRemoved = !existsSync(local.worktreePath);
		if (!worktreeRemoved) {
			if (!isInsideSessionsRoot(local.worktreePath)) {
				warnings.push(
					`Skipped folder removal at ${local.worktreePath}: not inside the managed sessions root`,
				);
			} else {
				try {
					await rm(local.worktreePath, { recursive: true, force: true });
					worktreeRemoved = true;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Failed to remove session folder at ${local.worktreePath}: ${message}`,
					});
				}
			}
		}
	} else if (local && !project) {
		worktreeRemoved = !existsSync(local.worktreePath);
		if (!worktreeRemoved) {
			warnings.push(
				`Skipped worktree removal at ${local.worktreePath}: project metadata is missing`,
			);
		}
	}
	if (local && project) {
		worktreeRemoved = !existsSync(local.worktreePath);
		if (!worktreeRemoved && isMissingDirectory(project.repoPath)) {
			// The project repo was moved or deleted outside Superset: there is
			// no repository to run `git worktree remove` in, and the worktree's
			// gitdir pointer is already dead, so no retry can ever succeed.
			// Only a genuine ENOENT takes this branch — a repo this process
			// merely cannot read (EPERM/EACCES) is not gone, and keeps the
			// "failed to open" throw below rather than losing its worktree.
			// Delete the folder directly under the same root guard the
			// sessions branch uses — anything outside the project's managed
			// worktrees root is left on disk (warned) while the delete proceeds.
			const worktreeBaseDir =
				project.worktreeBaseDir ?? getHostWorktreeBaseDir(ctx);
			if (
				!isInsideProjectWorktreesRoot(
					local.worktreePath,
					project.id,
					worktreeBaseDir,
				)
			) {
				warnings.push(
					`Skipped worktree removal at ${local.worktreePath}: project repo at ${project.repoPath} is missing and the folder is outside the managed worktrees root`,
				);
			} else {
				try {
					await rm(local.worktreePath, { recursive: true, force: true });
					worktreeRemoved = true;
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Failed to remove worktree at ${local.worktreePath}: ${message}`,
					});
				}
			}
		} else {
			try {
				repoGitEnv = await cleanupGitOps.resolveGitEnv(ctx, project.repoPath);
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
		}

		if (repoGitEnv) {
			// A task failure here means the post-remove state is unknown —
			// treat that like "still registered" and block rather than risk
			// orphaning disk past the archive commit point.
			let stillRegistered = true;
			let removeError: string | undefined;
			try {
				({ stillRegistered, removeError } = await cleanupGitOps.removeWorktree({
					repoPath: project.repoPath,
					worktreePath: local.worktreePath,
					gitEnv: repoGitEnv,
				}));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to verify worktree removal at ${local.worktreePath}: ${message}`,
				});
			}
			if (stillRegistered) {
				// git still tracks a live worktree here — removal genuinely
				// failed. Un-archive so the workspace stays visible and
				// retryable instead of orphaning disk past the commit point.
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to remove worktree at ${local.worktreePath}${
						removeError ? `: ${removeError}` : ""
					}`,
				});
			}
			if (!isMissingPath(local.worktreePath)) {
				// Unregistered is not removed: git's unregistration and its
				// recursive delete are not atomic, so `remove --force --force`
				// can drop the registration and still fail partway through
				// deleting files (locked file, live writer). Trusting the
				// registry alone silently orphaned the folder — no list shows
				// it, and a retry reports success without touching it (#6730).
				// Fall back to the same guarded direct removal the other
				// branches use.
				const worktreeBaseDir =
					project.worktreeBaseDir ?? getHostWorktreeBaseDir(ctx);
				if (
					!isInsideProjectWorktreesRoot(
						local.worktreePath,
						project.id,
						worktreeBaseDir,
					)
				) {
					warnings.push(
						`Worktree at ${local.worktreePath} is no longer registered with git, but its folder is outside the managed worktrees root and was left on disk`,
					);
				} else {
					try {
						await rm(local.worktreePath, { recursive: true, force: true });
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: `Worktree at ${local.worktreePath} is no longer registered with git, but its folder could not be removed: ${message}${
								removeError ? ` (git worktree remove: ${removeError})` : ""
							}`,
						});
					}
				}
			}
			// The outside-root branch above leaves the folder in place, so
			// report removal from the final disk state rather than assuming
			// this path always cleared it (#6785 review). `isMissingPath`
			// rather than `existsSync`: a leftover this process cannot read,
			// or a dangling symlink, still exists and must not be reported
			// as removed.
			worktreeRemoved = isMissingPath(local.worktreePath);
		}
	}

	// ─── Step 4: Optional branch delete ────────────────────────────
	// After the local commit point so a failure here can't block the delete.
	// An absent ref (renamed, pruned, or never materialized) already
	// satisfies the goal, so the task skips the delete without a scary
	// warning; a thrown git failure lands in the warning below rather than
	// being mistaken for "already gone".
	if (repoGitEnv && project && local?.branch && input.deleteBranch) {
		try {
			await cleanupGitOps.deleteLocalBranch({
				repoPath: project.repoPath,
				branch: local.branch,
				gitEnv: repoGitEnv,
			});
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

		// The desktop dev app profile, last: every throw above un-archives the
		// workspace and hands it back to the user, and a workspace that came
		// back must still have its logins and browser storage. By here nothing
		// can roll the delete back. Swallows its own failures — reclaiming
		// disk must never fail a delete.
		if (sharesProfileWithLiveWorkspace(ctx, local)) {
			// The profile directory is keyed by name alone, so same-named
			// workspaces share one. Reaping it here would wipe the survivor's
			// browser storage on a delete it had nothing to do with.
			warnings.push(
				`Left the dev app profile for "${local.name}" on disk: another workspace shares that name`,
			);
		} else {
			await removeDevAppProfile({ workspaceName: local.name });
		}
	}

	return {
		success: true,
		// Workspaces have no cloud row to delete any more. Released CLI/SDK
		// binaries still read this field, so it stays in the response.
		cloudDeleted: false,
		worktreeRemoved,
		branchDeleted,
		warnings,
	};
}

/**
 * True when a live workspace still answers to this name. The dev app derives
 * its profile directory from the workspace name alone, so same-named
 * workspaces share one — and the survivor must keep it.
 *
 * Reads fail closed (assume shared): leaving a directory on disk is the
 * recoverable mistake, and the startup sweep collects it once it goes stale.
 */
function sharesProfileWithLiveWorkspace(
	ctx: HostServiceContext,
	local: { id: string; name: string },
): boolean {
	// Defensive: rows written before the name column was backfilled carry ""
	// and test fixtures carry nothing at all. Neither names a profile.
	if (typeof local.name !== "string" || !local.name.trim()) return false;
	const profileKey = local.name.trim();
	try {
		// Compared trimmed in JS rather than matched in SQL: the profile key is
		// the trimmed name, so "foo" and " foo" share a directory that an
		// equality match would miss. The row count here is per host, and this
		// path already does far heavier work.
		const rows = ctx.db.query.workspaces
			.findMany({
				columns: { id: true, name: true },
				where: isNull(workspaces.archivedAt),
			})
			.sync();
		return rows.some(
			(row) => row.id !== local.id && row.name?.trim() === profileKey,
		);
	} catch (err) {
		console.warn("[workspace-cleanup] profile name-sharing lookup failed", err);
		return true;
	}
}

function formatTeardownWarning(
	teardown: Extract<TeardownResult, { status: "failed" }>,
): string {
	const detail = teardown.timedOut
		? "timed out"
		: teardown.exitCode !== null
			? `exit code ${teardown.exitCode}`
			: teardown.signal !== null
				? `signal ${teardown.signal}`
				: "unknown failure";
	// Tail is raw PTY bytes; strip control sequences for the plain-text
	// warnings channel (CLI/SDK/MCP).
	const tail = sanitizePromptForPty(teardown.outputTail).trim();
	return tail
		? `Teardown script failed (${detail}): ${tail}`
		: `Teardown script failed (${detail})`;
}
