import { toRel } from "../treePath";

/**
 * Pick the directory a new file/folder should be created in, based on the
 * current selection: the selected path if it's itself a known directory,
 * otherwise the selected file's parent, otherwise the workspace root.
 */
export function deriveCreationParent(
	selectedFilePath: string | undefined,
	knownPaths: Set<string>,
	rootPath: string,
): string {
	if (!selectedFilePath) return rootPath;
	const selectedRel = toRel(rootPath, selectedFilePath);
	if (knownPaths.has(`${selectedRel}/`)) return selectedFilePath;
	const lastSlash = selectedFilePath.lastIndexOf("/");
	return lastSlash > rootPath.length
		? selectedFilePath.slice(0, lastSlash)
		: rootPath;
}

/**
 * First non-colliding placeholder name for an inline "New file/folder" row
 * under `parentRel` — `untitled` / `Untitled`, then `-2`, `-3`, …
 */
export function pickPlaceholderName(
	parentRel: string,
	mode: "file" | "folder",
	knownPaths: Set<string>,
): string {
	const base = mode === "folder" ? "Untitled" : "untitled";
	const suffix = mode === "folder" ? "/" : "";
	const prefix = parentRel ? `${parentRel}/` : "";
	if (!knownPaths.has(`${prefix}${base}${suffix}`)) return base;
	for (let i = 2; i < 100; i++) {
		const name = `${base}-${i}`;
		if (!knownPaths.has(`${prefix}${name}${suffix}`)) return name;
	}
	return `${base}-${Date.now()}`;
}
