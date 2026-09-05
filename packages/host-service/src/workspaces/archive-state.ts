import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { workspaces } from "../db/schema";

/**
 * One column pair, `archived_at` + `archive_reason`, records both ways a
 * workspace leaves the sidebar:
 *
 * - **Tombstone** (`merged` | `deleted`): destroy's commit point. Stamped
 *   before any slow work so the row vanishes instantly, put back if the
 *   delete fails, and finished by the boot-time reconciler if the host died
 *   mid-delete. Rows are kept forever for the board's Merged/Deleted history.
 * - **User archive** (`user`): the reversible "Archive" action. Nothing else
 *   changes (worktree, branch, and terminals stay) and Unarchive clears the
 *   pair again.
 *
 * Every reader that means "destroyed" must ask {@link isTombstoned}, never
 * `archivedAt != null`: the reconciler in particular would otherwise remove
 * the worktree of a workspace the user only put away.
 */
export const ARCHIVE_REASONS = ["merged", "deleted", "user"] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
/** Destroy's reasons: "merged" when the linked PR was observed merged. */
export type TombstoneReason = Exclude<ArchiveReason, "user">;
export const USER_ARCHIVE_REASON = "user" satisfies ArchiveReason;

export interface ArchiveState {
	archivedAt: number | null;
	archiveReason: ArchiveReason | null;
}

export const LIVE_ARCHIVE_STATE: ArchiveState = {
	archivedAt: null,
	archiveReason: null,
};

/**
 * Destroyed, or being destroyed. A stamp without a reason counts too: 0020
 * added both columns together so none should exist, and the safe reading of
 * an unknown stamp is "gone", never "put away".
 */
export function isTombstoned(row: ArchiveState): boolean {
	return row.archivedAt != null && row.archiveReason !== USER_ARCHIVE_REASON;
}

/** Put away by the user; reversible, worktree and terminals intact. */
export function isUserArchived(row: ArchiveState): boolean {
	return row.archivedAt != null && row.archiveReason === USER_ARCHIVE_REASON;
}

/** SQL twins of the predicates above, for `where()` clauses. */
export const notTombstoned = or(
	isNull(workspaces.archivedAt),
	eq(workspaces.archiveReason, USER_ARCHIVE_REASON),
);
export const userArchived = and(
	isNotNull(workspaces.archivedAt),
	eq(workspaces.archiveReason, USER_ARCHIVE_REASON),
);
export const tombstoned = and(
	isNotNull(workspaces.archivedAt),
	or(
		isNull(workspaces.archiveReason),
		ne(workspaces.archiveReason, USER_ARCHIVE_REASON),
	),
);
