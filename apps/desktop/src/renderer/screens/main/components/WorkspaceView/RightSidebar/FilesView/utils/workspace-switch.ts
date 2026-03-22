/**
 * Tracks worktree path changes and determines when the file tree
 * should be invalidated due to a workspace switch.
 *
 * The key invariant: when `worktreePath` transiently becomes `undefined`
 * (e.g. during a workspace query loading state), the previous valid path
 * must be preserved so that a subsequent new path correctly triggers
 * invalidation.
 */
export function createWorktreePathTracker() {
	let previous: string | undefined;

	return {
		/**
		 * Called whenever `worktreePath` changes. Returns `true` when the
		 * tree should be invalidated (i.e. a real workspace switch occurred).
		 */
		update(worktreePath: string | undefined): boolean {
			if (!worktreePath) {
				// Don't clear `previous` — the path may be temporarily undefined
				// while a new workspace query is loading.
				return false;
			}

			const shouldInvalidate =
				previous !== undefined && previous !== worktreePath;

			previous = worktreePath;
			return shouldInvalidate;
		},

		/** Expose current tracked value for testing. */
		get current() {
			return previous;
		},
	};
}
