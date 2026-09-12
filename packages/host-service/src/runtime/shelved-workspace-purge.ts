import { lstatSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { projects, workspaces } from "../db/schema";
import { destroyWorkspace } from "../trpc/router/workspace-cleanup";
import type { HostServiceContext } from "../types";
import {
	getLocalWorkspace,
	markShelvedPurgeBlocked,
} from "../workspaces/local-workspace-store";

/** How long an archived (shelved) workspace is kept before it is destroyed. */
export const SHELF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** How often the purge sweep runs after the boot pass. */
export const SHELF_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Shelved rows whose retention window has elapsed. A tombstoned row
 * (`archivedAt` set) is already being deleted — the archived-workspace
 * reconciler owns it — so it never belongs to this sweep. Pure so the
 * retention policy is testable without a clock or a database.
 */
export function selectExpiredShelved<
	T extends { shelvedAt: number | null; archivedAt: number | null },
>(rows: T[], now: number, retentionMs: number = SHELF_RETENTION_MS): T[] {
	return rows.filter(
		(row) =>
			row.archivedAt == null &&
			row.shelvedAt != null &&
			row.shelvedAt + retentionMs <= now,
	);
}

type DestroyWorkspace = typeof destroyWorkspace;

/**
 * Why the sweep left a shelved row alone. `dirty` is git's own answer — it
 * also covers commits no remote has, because the purge deletes the branch
 * with `-D` and that work exists nowhere else;
 * `unverifiable` means git could not answer at all, which on an unattended
 * destructive path must read as "keep it" — the interactive delete's
 * preflight swallows that case because a user is there to force it.
 */
export type PurgeBlockedReason = "dirty" | "unverifiable";

type WorktreeState = { hasChanges: boolean; hasUnpushedCommits: boolean };

type ReadWorktreeState = (
	ctx: HostServiceContext,
	worktreePath: string,
	workspaceId: string,
) => Promise<WorktreeState>;

async function readWorktreeStateForPurge(
	ctx: HostServiceContext,
	worktreePath: string,
	workspaceId: string,
): Promise<WorktreeState> {
	const missing =
		lstatSync(worktreePath, { throwIfNoEntry: false }) === undefined;
	const local = getLocalWorkspace(ctx.db, workspaceId);
	const project = local?.projectId
		? ctx.db.query.projects
				.findFirst({ where: eq(projects.id, local.projectId) })
				.sync()
		: undefined;
	if (!local || !project) throw new Error("Missing purge repository metadata");

	const targets = [
		{ path: project.repoPath, ref: `refs/heads/${local.branch}` },
	];
	if (!missing) targets.push({ path: worktreePath, ref: "HEAD" });
	let hasChanges = false;
	let hasUnpushedCommits = false;
	for (const target of targets) {
		const git = await ctx.git(target.path, {
			timeout: { block: 15_000, stdOut: false, stdErr: false },
		});
		if (target.ref === "HEAD") hasChanges = !(await git.status()).isClean();
		const result = (
			await git.raw([
				"rev-list",
				"--count",
				target.ref,
				"--not",
				"--remotes",
				"--",
			])
		).trim();
		if (!/^\d+$/.test(result)) throw new Error("Invalid purge commit count");
		hasUnpushedCommits ||= Number(result) > 0;
	}
	return { hasChanges, hasUnpushedCommits };
}

/**
 * Whether the row the sweep picked up is still the shelved row it read. Every
 * write below follows an await, and a restore or a tombstone in that window
 * must win: a live workspace must never be destroyed, nor left carrying a
 * purge-blocked marker only unshelve would clear.
 */
function stillShelved(
	ctx: HostServiceContext,
	row: { id: string; shelvedAt: number | null },
): boolean {
	const current = getLocalWorkspace(ctx.db, row.id);
	return (
		current != null &&
		current.archivedAt == null &&
		current.shelvedAt === row.shelvedAt
	);
}

// Module-level: the boot pass and the interval share one host process, and a
// sweep can outlive a tick (a destroy runs teardown and git). Overlapping
// sweeps would hand the same row to two destroys.
let running = false;

/**
 * Destroy every workspace that has sat on the shelf past the retention
 * window, local branch included: after 30 days unrestored the workspace is
 * gone for good. Preflight stays on, so a worktree with uncommitted work
 * blocks its own purge and keeps the row instead.
 *
 * `destroy` is injectable for tests only; production always uses the real
 * destroy saga, whose own in-flight guard (not ours) answers CONFLICT when a
 * user-initiated delete is already running for the same row.
 */
export async function runShelvedWorkspacePurge(
	ctx: HostServiceContext,
	destroy: DestroyWorkspace = destroyWorkspace,
	readWorktreeState: ReadWorktreeState = readWorktreeStateForPurge,
): Promise<void> {
	if (running) return;
	running = true;
	try {
		const shelved = ctx.db
			.select({
				id: workspaces.id,
				worktreePath: workspaces.worktreePath,
				shelvedAt: workspaces.shelvedAt,
				archivedAt: workspaces.archivedAt,
			})
			.from(workspaces)
			.where(
				and(isNotNull(workspaces.shelvedAt), isNull(workspaces.archivedAt)),
			)
			.all();

		const expired = selectExpiredShelved(shelved, Date.now());
		if (expired.length === 0) return;

		let purged = 0;
		for (const row of expired) {
			let state: WorktreeState;
			try {
				state = await readWorktreeState(ctx, row.worktreePath, row.id);
			} catch {
				if (stillShelved(ctx, row)) {
					markShelvedPurgeBlocked(ctx, row.id, "unverifiable");
				}
				continue;
			}
			if (state.hasChanges || state.hasUnpushedCommits) {
				if (stillShelved(ctx, row)) {
					markShelvedPurgeBlocked(ctx, row.id, "dirty");
				}
				continue;
			}
			if (row.shelvedAt == null || !stillShelved(ctx, row)) continue;
			try {
				await destroy(ctx, {
					workspaceId: row.id,
					expectedShelvedAt: row.shelvedAt,
					deleteBranch: true,
					force: false,
					teardownMode: "best-effort",
				});
				purged += 1;
			} catch (err) {
				// Every failure un-archives the row inside destroy, so it stays
				// shelved and the next sweep retries it. The only thing that
				// differs is whether the user needs an explanation.
				if (isDeleteInProgress(err)) continue;
				if (err instanceof TRPCError && err.code === "CONFLICT") {
					// The only other CONFLICT destroy raises is the dirty-worktree
					// preflight: the shelf must not silently throw away work.
					if (stillShelved(ctx, row)) {
						markShelvedPurgeBlocked(ctx, row.id, "dirty");
					}
					continue;
				}
				console.warn("[shelved-workspace-purge] failed to purge workspace", {
					workspaceId: row.id,
					err,
				});
			}
		}
		if (purged > 0) {
			console.log(
				`[shelved-workspace-purge] purged ${purged} expired shelved workspace(s)`,
			);
		}
	} finally {
		running = false;
	}
}

function isDeleteInProgress(err: unknown): boolean {
	if (!(err instanceof TRPCError) || err.code !== "CONFLICT") return false;
	return (
		(err.cause as { kind?: string } | undefined)?.kind === "DELETE_IN_PROGRESS"
	);
}

/**
 * Schedule the recurring sweep. The boot pass is run by the caller (ordered
 * after the archived-workspace reconcile), so this only installs the timer.
 * Unref'd like the terminal reaper so a pending tick never holds the process
 * open; the returned stop keeps a disposed app from sweeping a closed db.
 */
export function startShelvedWorkspacePurge(
	ctx: HostServiceContext,
): () => void {
	const interval = setInterval(() => {
		void runShelvedWorkspacePurge(ctx).catch((err) => {
			console.warn("[shelved-workspace-purge] sweep failed:", err);
		});
	}, SHELF_PURGE_INTERVAL_MS);
	interval.unref();
	return () => clearInterval(interval);
}
