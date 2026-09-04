// A changeset can legitimately contain a path that is both a file entry and a
// parent directory of other entries (e.g. a file deleted and a same-named
// directory added in the same change set). `@pierre/trees` keys children by
// exact segment name and throws on that shape, so colliding file entries get
// a zero-width-space suffix: visually identical, but a distinct tree path.
const COLLISION_MARKER = "\u200b";

export interface CollisionSafeTreePaths {
	/** Paths safe to hand to `@pierre/trees`; same order as the input. */
	treePaths: string[];
	/** Real changeset path → tree path. Only remapped entries are present. */
	toTreePath: Map<string, string>;
	/** Tree path → real changeset path. Only remapped entries are present. */
	toRealPath: Map<string, string>;
}

/**
 * Disambiguate file paths that collide with directories implied by other
 * paths in the list. Tree paths returned here are display/tree identifiers
 * only — map them back through `toRealPath` before treating them as
 * changeset paths.
 */
export function buildCollisionSafeTreePaths(
	paths: string[],
): CollisionSafeTreePaths {
	const dirPrefixes = new Set<string>();
	for (const path of paths) {
		let slash = path.indexOf("/");
		while (slash !== -1) {
			dirPrefixes.add(path.slice(0, slash));
			slash = path.indexOf("/", slash + 1);
		}
	}
	const toTreePath = new Map<string, string>();
	const toRealPath = new Map<string, string>();
	const taken = new Set(paths);
	const treePaths = paths.map((path) => {
		if (!dirPrefixes.has(path)) return path;
		let treePath = path + COLLISION_MARKER;
		while (taken.has(treePath) || dirPrefixes.has(treePath))
			treePath += COLLISION_MARKER;
		taken.add(treePath);
		toTreePath.set(path, treePath);
		toRealPath.set(treePath, path);
		return treePath;
	});
	return { treePaths, toTreePath, toRealPath };
}
