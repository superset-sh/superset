import type { FileSystemChangeEvent } from "shared/file-tree-types";

export interface CollectedEventPaths {
	/**
	 * Specific absolute paths affected by the event. Empty when the event is
	 * an `overflow` (watcher lost track) — callers should fall back to a
	 * worktree-wide invalidation in that case.
	 */
	paths: string[];
	/**
	 * True when the event is `overflow`, signalling the watcher lost track of
	 * one or more changes. Callers should invalidate every diff query for the
	 * affected worktree because the specific paths are unknown.
	 */
	isOverflow: boolean;
}

/**
 * Extracts the absolute paths affected by a file system event so callers can
 * invalidate cached queries keyed by `absolutePath`.
 *
 * For renames both the old and new path are returned because consumers may
 * have queries keyed by either side (e.g. inline diffs of a renamed file).
 */
export function collectEventPaths(
	event: FileSystemChangeEvent,
): CollectedEventPaths {
	if (event.type === "overflow") {
		return { paths: [], isOverflow: true };
	}

	const paths: string[] = [];
	if (event.absolutePath) {
		paths.push(event.absolutePath);
	}
	if (
		event.type === "rename" &&
		event.oldAbsolutePath &&
		event.oldAbsolutePath !== event.absolutePath
	) {
		paths.push(event.oldAbsolutePath);
	}

	return { paths, isOverflow: false };
}
