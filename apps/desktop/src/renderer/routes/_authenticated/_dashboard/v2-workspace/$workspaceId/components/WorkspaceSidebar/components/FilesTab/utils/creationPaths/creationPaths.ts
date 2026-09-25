import { toAbs } from "../treePath";

/**
 * Pick the directory a new file/folder should be created in, from the tree's
 * own selection: a selected folder, a selected file's parent, or — with
 * nothing selected — the workspace root.
 *
 * Driven by the visible selection rather than the editor's open file. The two
 * disagree constantly: the editor keeps a path across folder renames, and it
 * can point somewhere the tree isn't even showing, which made the button
 * create in one fixed place no matter which folder was highlighted.
 *
 * Every candidate is still checked against `knownPaths`, so a row for a
 * directory that has since been renamed or deleted falls back to the root
 * instead of targeting a path that no longer exists.
 */
export function deriveCreationParent(
	selectedTreePaths: readonly string[],
	knownPaths: Set<string>,
	rootPath: string,
): string {
	const selected = selectedTreePaths[selectedTreePaths.length - 1];
	if (!selected) return rootPath;

	// Pierre marks directory rows with a trailing slash.
	if (selected.endsWith("/")) {
		return knownPaths.has(selected) ? toAbs(rootPath, selected) : rootPath;
	}

	const lastSlash = selected.lastIndexOf("/");
	if (lastSlash < 0) return rootPath;

	const parentRelPath = selected.slice(0, lastSlash);
	return knownPaths.has(`${parentRelPath}/`)
		? toAbs(rootPath, parentRelPath)
		: rootPath;
}

/** Base name a new entry starts from, before the host de-duplicates it. */
export const CREATION_BASE_NAME = {
	folder: "Untitled",
	file: "untitled",
} as const;

/**
 * Pierre's canonical tree key for a newly created entry: `parentRel` + `name`,
 * with the trailing slash that marks a directory row.
 *
 * The single place this key is spelled out, so the key we register in the tree
 * cannot drift from the key we later look up.
 */
export function buildCreationKey(
	parentRel: string,
	name: string,
	mode: "file" | "folder",
): string {
	const prefix = parentRel ? `${parentRel}/` : "";
	return `${prefix}${name}${mode === "folder" ? "/" : ""}`;
}

// De-duplicating the name (`Untitled`, `Untitled-2`, …) used to happen here,
// against the client's `knownPaths` cache. It now happens host-side in
// `createUniqueEntry`, where each attempt is an exclusive create: a cache that
// hasn't caught up can no longer pick a name that already exists on disk.
