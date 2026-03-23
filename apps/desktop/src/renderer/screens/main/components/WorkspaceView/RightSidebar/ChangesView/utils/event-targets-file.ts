import { pathsMatch, retargetAbsolutePath } from "shared/absolute-paths";
import type { FileSystemChangeEvent } from "shared/file-tree-types";

/**
 * Determines whether a file system change event affects the file at the given
 * absolute path.  Used by ChangesView to decide which diff queries to
 * invalidate when the watcher reports a change.
 */
export function eventTargetsFile(
	event: FileSystemChangeEvent,
	absolutePath: string | null,
): boolean {
	if (!absolutePath) {
		return false;
	}

	if (event.type === "overflow") {
		return true;
	}

	if (event.type === "rename" && event.absolutePath && event.oldAbsolutePath) {
		return (
			retargetAbsolutePath(
				absolutePath,
				event.oldAbsolutePath,
				event.absolutePath,
				Boolean(event.isDirectory),
			) !== null
		);
	}

	if (!event.absolutePath) {
		return false;
	}

	return pathsMatch(event.absolutePath, absolutePath);
}
