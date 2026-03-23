import type { FileSystemChangeEvent } from "shared/file-tree-types";

/**
 * Given a file-system change event, returns the set of absolute paths whose
 * diff-content queries should be invalidated so the expanded diff view stays
 * up-to-date when files change on disk.
 *
 * Returns `"all"` when the event is an overflow (too many changes to track
 * individually), signalling that _all_ diff content queries should be
 * invalidated.
 */
export function computeDiffInvalidations(
	event: FileSystemChangeEvent,
): "all" | string[] {
	if (event.type === "overflow") {
		return "all";
	}

	const paths: string[] = [];

	if (event.absolutePath) {
		paths.push(event.absolutePath);
	}

	// For renames, both the old and new paths may have cached queries.
	if (event.type === "rename" && event.oldAbsolutePath) {
		paths.push(event.oldAbsolutePath);
	}

	return paths;
}
