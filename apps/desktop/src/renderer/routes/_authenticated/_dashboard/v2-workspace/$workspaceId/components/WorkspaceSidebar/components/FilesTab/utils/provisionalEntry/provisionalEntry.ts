/**
 * A newly created entry that is still being named inline.
 *
 * The Files tab creates files/folders on disk *before* opening the rename
 * input, so the inline name is a rename of something real. That makes
 * accept-the-default, cancel, and name collisions all end in a state that
 * matches disk — but it also means cancelling has to delete what we made, so we
 * have to be certain we are deleting our own provisional entry and nothing
 * else.
 *
 * Identity is therefore the tree key *plus* the workspace it belongs to. A bare
 * relative path is not enough: the same path exists in every workspace.
 */
export interface ProvisionalEntry {
	/** Canonical Pierre tree key — directories carry a trailing slash. */
	key: string;
	absolutePath: string;
	mode: "file" | "folder";
	/** Files only: guards cleanup against a file that changed after creation. */
	revision?: string;
	rootPath: string;
	/** `bridge.getVersion()` at creation — bumped on every workspace switch. */
	versionToken: number;
}

export type ProvisionalEvent =
	| { type: "created"; entry: ProvisionalEntry }
	| { type: "renamed"; sourceKey: string }
	| { type: "rename-error" }
	| { type: "removed"; path: string; rootPath: string; versionToken: number }
	| { type: "workspace-changed" };

export type ProvisionalAction =
	| { type: "none" }
	/** Remove the entry from disk — only ever our own, still-provisional entry. */
	| { type: "cleanup"; entry: ProvisionalEntry };

const NONE: { state: ProvisionalEntry | null; action: ProvisionalAction } = {
	state: null,
	action: { type: "none" },
};

/**
 * Decides what happens to the provisional entry as the rename session plays out.
 *
 * Pure and exhaustively tested because getting it wrong deletes user data.
 *
 * One state is unavoidable: committing a rename unchanged (New Folder →
 * Enter) emits no Pierre event at all, so the entry stays armed even though it
 * is now a committed folder. That is safe here because the only action this
 * can produce is `cleanup`, which requires a `remove` for that exact path in
 * the same workspace — and `remove` with cleanup semantics is only ever armed
 * by our own creation flow. Should one slip through, cleanup is an `rmdir`
 * that refuses a non-empty directory, so the worst case is an empty folder we
 * created ourselves disappearing, never user data.
 */
export function reduceProvisional(
	state: ProvisionalEntry | null,
	event: ProvisionalEvent,
): { state: ProvisionalEntry | null; action: ProvisionalAction } {
	switch (event.type) {
		case "created":
			return { state: event.entry, action: { type: "none" } };

		// Committed under a new name: it is a real, named entry now.
		case "renamed":
			return state?.key === event.sourceKey
				? NONE
				: { state, action: { type: "none" } };

		// Pierre rejected the typed name (collision, or a `/` in it) and ended the
		// rename session.
		//
		// The entry keeps its current name on disk, so it stays usable and the
		// user can rename it again whenever. We deliberately do NOT reopen the
		// inline rename: Pierre's `onError` reports only a message, never a path,
		// so we cannot tell which row failed — F2 is handled inside Pierre and
		// never reaches our wrappers. Reopening would guess, and after an
		// unchanged commit (which emits no event, leaving this state armed) the
		// guess would land on a committed folder and re-arm cleanup on it.
		case "rename-error":
			return NONE;

		// Pierre removed the row. Only our own provisional entry, in this
		// workspace, may be cleaned up from disk.
		case "removed":
			if (
				state === null ||
				state.key !== event.path ||
				state.rootPath !== event.rootPath ||
				state.versionToken !== event.versionToken
			) {
				return { state, action: { type: "none" } };
			}
			return { state: null, action: { type: "cleanup", entry: state } };

		// The entry exists on disk and the user may come back to it, so drop the
		// bookkeeping without deleting anything.
		case "workspace-changed":
			return NONE;
	}
}
