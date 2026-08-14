/**
 * The Files tab's path-keyed view of the tree, kept alongside Pierre's own
 * model. All three sets have to move together: they are keyed by path, so a
 * folder rename invalidates every entry underneath it at once.
 */
export interface TreeBookkeeping {
	/** Every path Pierre knows about. Files bare, directories trailing-slash. */
	knownPaths: Set<string>;
	/** Relative directories whose children have been fetched. "" = root. */
	loadedDirs: Set<string>;
	/**
	 * Known-but-unfetched directories, checked on expand to decide what to
	 * lazy-load. A directory missing from here after a rename can never load its
	 * children, so it must be rekeyed with the rest.
	 */
	unloadedDirCandidates: Set<string>;
}

/**
 * Drop `dirRel` and everything under it. Used after a folder is removed (or
 * renamed, paired with `rekeyDirectory`) so stale descendants don't pin paths
 * that no longer exist on disk.
 */
export function purgeDirectory(
	bookkeeping: TreeBookkeeping,
	dirRel: string,
): void {
	const { knownPaths, loadedDirs, unloadedDirCandidates } = bookkeeping;
	const prefix = `${dirRel}/`;

	for (const path of knownPaths) {
		if (path.startsWith(prefix)) knownPaths.delete(path);
	}
	for (const dir of loadedDirs) {
		if (dir === dirRel || dir.startsWith(prefix)) loadedDirs.delete(dir);
	}
	for (const dir of unloadedDirCandidates) {
		if (dir === dirRel || dir.startsWith(prefix)) {
			unloadedDirCandidates.delete(dir);
		}
	}
}

/**
 * Re-key `oldDir` and its descendants to live under `newDir`.
 *
 * Pierre's `model.move` already moves the renamed subtree on its side, but our
 * bookkeeping is path-keyed, so without this the fs reconciler looks up paths
 * that no longer exist and skips real changes — and a renamed directory that
 * was never expanded loses its place in `unloadedDirCandidates`, which means
 * expanding it later never triggers a fetch and it renders empty.
 */
export function rekeyDirectory(
	bookkeeping: TreeBookkeeping,
	oldDir: string,
	newDir: string,
): void {
	const { knownPaths, loadedDirs, unloadedDirCandidates } = bookkeeping;
	const oldPrefix = `${oldDir}/`;

	// Collect before mutating: rewriting a Set while iterating it can revisit
	// entries that were just re-added under the new prefix.
	const movedKnown = [...knownPaths].filter((path) =>
		path.startsWith(oldPrefix),
	);
	for (const path of movedKnown) {
		knownPaths.delete(path);
		knownPaths.add(newDir + path.slice(oldDir.length));
	}

	const movedLoaded = [...loadedDirs].filter(
		(dir) => dir === oldDir || dir.startsWith(oldPrefix),
	);
	for (const dir of movedLoaded) {
		loadedDirs.delete(dir);
		loadedDirs.add(newDir + dir.slice(oldDir.length));
	}

	const movedCandidates = [...unloadedDirCandidates].filter(
		(dir) => dir === oldDir || dir.startsWith(oldPrefix),
	);
	for (const dir of movedCandidates) {
		unloadedDirCandidates.delete(dir);
		unloadedDirCandidates.add(newDir + dir.slice(oldDir.length));
	}
}
