export interface PathTypeCollisionResolution {
	/** Safe to hand to `@pierre/trees` — colliding leaves removed. */
	paths: string[];
	/** Leaf paths displaced by a directory of the same name. */
	foldedPaths: ReadonlySet<string>;
}

const NO_COLLISIONS: ReadonlySet<string> = new Set();

/**
 * Drop paths another path already claims as a directory.
 *
 * `@pierre/trees` requires a name to be either a file or a directory within its
 * parent and throws when asked for both, but git legitimately reports one path
 * in both forms once an entry's on-disk type flips. Replacing a tracked
 * directory with a symlink yields ` D pkg/skills/x/SKILL.md` (needs `x` as a
 * directory) alongside `?? pkg/skills/x` (a leaf); swapping a tracked symlink
 * for a real directory produces the mirror image.
 *
 * The directory wins — it holds the other changed files, which would otherwise
 * have nowhere to live. Callers fold the displaced leaf's status and diff stats
 * onto the surviving directory row so no change silently disappears.
 */
export function resolvePathTypeCollisions(
	paths: string[],
): PathTypeCollisionResolution {
	const impliedDirectories = new Set<string>();
	for (const path of paths) {
		const segments = path.split("/");
		let acc = "";
		for (let i = 0; i < segments.length - 1; i++) {
			acc = acc ? `${acc}/${segments[i]}` : segments[i];
			impliedDirectories.add(acc);
		}
	}

	const foldedPaths = new Set<string>();
	for (const path of paths) {
		if (impliedDirectories.has(path)) foldedPaths.add(path);
	}

	// Keep the original array identity in the common case: `paths` feeds a
	// `useMemo` and `model.resetPaths`, so a fresh array every render would
	// rebuild the tree for nothing.
	if (foldedPaths.size === 0) return { paths, foldedPaths: NO_COLLISIONS };

	return {
		paths: paths.filter((path) => !foldedPaths.has(path)),
		foldedPaths,
	};
}
