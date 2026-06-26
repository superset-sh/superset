import type { FileSystemChangeEvent } from "shared/file-tree-types";

/**
 * Plan describing which cached queries must be invalidated in response to a
 * batch of file-system change events.
 *
 * Content queries (`getGitOriginalContent`, `getGitFileContents`,
 * `filesystem.readFile`) back the inline diff rendered for every changed file
 * in the Changes panel — not only the currently selected file. They are keyed
 * by the file's absolute path, so to keep every visible diff in sync we
 * invalidate the path that actually changed, regardless of selection.
 */
export interface ContentInvalidationPlan {
	/** Branch list should be refreshed (only on watcher overflow). */
	invalidateBranches: boolean;
	/**
	 * Path information was lost (watcher overflow) so every content query must
	 * be invalidated broadly rather than per-path.
	 */
	invalidateAllContent: boolean;
	/** Absolute paths whose content queries must be invalidated. */
	contentPaths: Set<string>;
}

export function createEmptyContentInvalidationPlan(): ContentInvalidationPlan {
	return {
		invalidateBranches: false,
		invalidateAllContent: false,
		contentPaths: new Set<string>(),
	};
}

/**
 * Fold a single file-system change event into an invalidation plan.
 *
 * Unlike the previous behavior — which only refreshed content for the file the
 * user had selected — this records the absolute path(s) the event actually
 * touched. That ensures follow-up edits to any changed file (not just the
 * selected one) invalidate that file's content queries, so its inline diff
 * stops showing a stale change set.
 */
export function accumulateContentInvalidation(
	plan: ContentInvalidationPlan,
	event: FileSystemChangeEvent,
): ContentInvalidationPlan {
	if (event.type === "overflow") {
		plan.invalidateBranches = true;
		plan.invalidateAllContent = true;
		return plan;
	}

	if (event.absolutePath) {
		plan.contentPaths.add(event.absolutePath);
	}

	// A rename moves content from the old path to the new one; both diffs need
	// to refresh.
	if (event.type === "rename" && event.oldAbsolutePath) {
		plan.contentPaths.add(event.oldAbsolutePath);
	}

	return plan;
}
