/**
 * `@pierre/trees` denotes directory rows with a trailing `/` (its canonical
 * directory path form). Drop it to get the bare path. Safe to call on file
 * paths (no-op).
 */
export function stripTrailingSlash(path: string): string {
	return path.endsWith("/") ? path.slice(0, -1) : path;
}
