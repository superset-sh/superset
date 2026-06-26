import type { ChangedFile } from "shared/changes-types";

/**
 * Filter a list of changed files by a free-text query.
 *
 * Matching is case-insensitive and tests the file's current path as well as
 * its original path (for renames/copies), so a rename can be found by either
 * name. An empty or whitespace-only query returns the list unchanged.
 */
export function filterChangedFiles(
	files: ChangedFile[],
	query: string,
): ChangedFile[] {
	const trimmed = query.trim().toLowerCase();
	if (trimmed.length === 0) {
		return files;
	}

	return files.filter((file) => {
		if (file.path.toLowerCase().includes(trimmed)) {
			return true;
		}
		return file.oldPath ? file.oldPath.toLowerCase().includes(trimmed) : false;
	});
}
