/**
 * `@pierre/trees` denotes directory rows with a trailing `/` (its canonical
 * directory path form). Drop it to get the bare path. Safe to call on file
 * paths (no-op).
 */
export function stripTrailingSlash(path: string): string {
	return path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Put a path back into `@pierre/trees`' canonical form, where directories carry
 * a trailing `/`.
 *
 * Needed because Pierre is inconsistent about which form it hands out:
 * `FileTreeRenameEvent` reports slash-less paths even when its own `isFolder`
 * flag is `true`, while its model — and any bookkeeping keyed alongside it —
 * uses the trailing-slash form. Canonicalize event paths before looking them up
 * anywhere, or directory lookups silently miss.
 *
 * Idempotent, so it is safe to apply to a path that is already canonical.
 */
export function canonicalizeTreePath(
	path: string,
	isDirectory: boolean,
): string {
	if (!isDirectory) return path;
	return path.endsWith("/") ? path : `${path}/`;
}
