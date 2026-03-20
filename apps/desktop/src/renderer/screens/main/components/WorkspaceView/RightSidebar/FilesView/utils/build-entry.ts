import type { DirectoryEntry } from "shared/file-tree-types";

/**
 * Build a {@link DirectoryEntry} for a tree item that is not yet in the cache.
 *
 * @param itemId    – absolute path used as the tree‑item identifier
 * @param rootPath  – the workspace root path (may be `undefined` during init)
 * @param isDirectory – whether the path points to a directory (as determined
 *                      by querying the filesystem)
 */
export function buildUncachedEntry(
	itemId: string,
	rootPath: string | undefined,
	isDirectory: boolean,
): DirectoryEntry {
	const name = itemId.split(/[/\\]/).pop() ?? itemId;
	const relativePath =
		rootPath && itemId.startsWith(rootPath)
			? itemId.slice(rootPath.length).replace(/^[/\\]/, "")
			: itemId;

	return {
		id: itemId,
		name,
		path: itemId,
		relativePath,
		isDirectory,
	};
}
