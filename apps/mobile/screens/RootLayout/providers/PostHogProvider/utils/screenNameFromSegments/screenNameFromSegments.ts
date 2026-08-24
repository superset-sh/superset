/**
 * The route pattern the user is on rather than the URL they are on:
 * `/workspace/[id]`, never `/workspace/2f9c8a1e-…`. Passing the raw pathname
 * gave every workspace its own $screen — 298 of 319 distinct screen names in
 * production were one workspace's UUID.
 *
 * Route groups are layout scaffolding nobody navigates to, and an `index` leaf
 * is its parent's own screen, so neither belongs in a name read off a chart.
 */
export function screenNameFromSegments(segments: string[]): string {
	const path = segments.filter(
		(segment) => !(segment.startsWith("(") && segment.endsWith(")")),
	);
	if (path[path.length - 1] === "index") path.pop();
	return path.length === 0 ? "/" : `/${path.join("/")}`;
}

/** `[id]` → `id`, `[...rest]` → `rest`. Null for a static segment. */
export function dynamicSegmentName(segment: string): string | null {
	if (!segment.startsWith("[") || !segment.endsWith("]")) return null;
	return segment.slice(1, -1).replace(/^\.\.\./, "");
}
