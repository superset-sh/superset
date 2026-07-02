/**
 * `@pierre/trees` denotes directory rows with a trailing `/` (its canonical
 * directory path form). Drop it to get the bare path. Safe to call on file
 * paths (no-op).
 */
export function stripTrailingSlash(path: string): string {
	return path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Drop paths that can't coexist in a `@pierre/trees` tree, returning a
 * deterministic, collision-free subset (input order preserved).
 *
 * Pierre's path-store builder throws `Path collides with an existing file
 * while creating directory "X"` when one input path is registered as a *file
 * leaf* (`a/b`) while another input path forces the same name to be a
 * *directory* (`a/b/c`). A repo that tracks a symlink-to-directory (git mode
 * `120000`) produces exactly this: the symlink `a/b` is a leaf, yet other
 * changed paths resolve underneath it as `a/b/c`. The builder has no tolerant
 * mode for this during construction — it always throws — so the whole Changes
 * view crashes (#5224).
 *
 * We resolve it before handing paths to Pierre by letting the directory
 * representation win: any path that is a strict ancestor prefix of another
 * input path is dropped, so the deeper paths can build their directory chain.
 * Exact duplicates are collapsed too (Pierre also throws on those).
 */
export function resolveTreePathCollisions(paths: string[]): string[] {
	if (paths.length < 2) return paths;

	// Every directory prefix implied by the inputs. A path appearing here is an
	// ancestor of some other path and therefore cannot also be a leaf.
	const directoryPrefixes = new Set<string>();
	for (const path of paths) {
		const segments = path.split("/");
		let prefix = "";
		for (let i = 0; i < segments.length - 1; i++) {
			prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
			directoryPrefixes.add(prefix);
		}
	}

	const seen = new Set<string>();
	return paths.filter((path) => {
		if (directoryPrefixes.has(path)) return false;
		if (seen.has(path)) return false;
		seen.add(path);
		return true;
	});
}
