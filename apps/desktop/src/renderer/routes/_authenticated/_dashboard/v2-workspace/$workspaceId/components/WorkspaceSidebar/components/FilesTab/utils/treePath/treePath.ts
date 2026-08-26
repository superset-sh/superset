import type {
	FileTree,
	FileTreeDirectoryHandle,
	FileTreeItemHandle,
} from "@pierre/trees";
import { stripTrailingSlash } from "renderer/lib/pierreTree";

export { stripTrailingSlash };

export function toPosix(p: string): string {
	return p.replace(/\\/g, "/");
}

export function toRel(rootPath: string, abs: string): string {
	const a = toPosix(abs);
	const r = toPosix(rootPath);
	if (a === r) return "";
	if (a.startsWith(`${r}/`)) return a.slice(r.length + 1);
	return a;
}

export function toAbs(rootPath: string, rel: string): string {
	const trimmed = stripTrailingSlash(rel);
	return trimmed ? `${rootPath}/${trimmed}` : rootPath;
}

export function parentRel(rel: string): string {
	const trimmed = stripTrailingSlash(rel);
	const i = trimmed.lastIndexOf("/");
	return i < 0 ? "" : trimmed.slice(0, i);
}

export function basename(rel: string): string {
	const trimmed = stripTrailingSlash(rel);
	const i = trimmed.lastIndexOf("/");
	return i < 0 ? trimmed : trimmed.slice(i + 1);
}

/** Resolve a watcher deletion to Pierre's canonical path and entry type. */
export function resolveDeleteTreePath(
	known: Set<string>,
	rel: string,
	isDirectory: boolean | undefined,
): { treePath: string; isDirectory: boolean } {
	const directoryPath = `${rel}/`;
	const resolvedIsDirectory = known.has(directoryPath)
		? true
		: known.has(rel)
			? false
			: isDirectory === true;
	const treePath = resolvedIsDirectory ? directoryPath : rel;
	return {
		treePath,
		isDirectory: resolvedIsDirectory,
	};
}

// Pierre's `isDirectory()` is typed as `() => true | false` (literal returns
// per branch) but isn't a TS predicate, so the union doesn't narrow. This
// helper turns it into one.
export function asDirectoryHandle(
	handle: FileTreeItemHandle | null,
): FileTreeDirectoryHandle | null {
	return handle?.isDirectory() ? (handle as FileTreeDirectoryHandle) : null;
}

/**
 * The directory handle for `treePath`, or null when Pierre can't produce one.
 *
 * `getItem` is typed to return null for a path Pierre doesn't hold, but it
 * throws instead when the lookup walks through a node with no child index —
 * a path whose ancestor Pierre holds as a file. That happens when the watcher
 * loses a stat race and reports a directory with `isDirectory: false`, so the
 * fs-event handler adds it as a file and every later lookup beneath it throws.
 * Callers use the handle only to ask whether a directory is already expanded,
 * and not being able to ask is the same answer as "not expanded".
 */
export function lookupDirectory(
	model: Pick<FileTree, "getItem">,
	treePath: string,
): FileTreeDirectoryHandle | null {
	try {
		return asDirectoryHandle(model.getItem(treePath));
	} catch {
		return null;
	}
}
