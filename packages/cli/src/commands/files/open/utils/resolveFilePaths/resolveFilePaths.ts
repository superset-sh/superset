import { resolve } from "node:path";

/** Absolute paths in the order given, relative ones anchored at `cwd`, repeats dropped. */
export function resolveFilePaths(
	paths: readonly string[],
	cwd: string,
): string[] {
	const seen = new Set<string>();
	const resolved: string[] = [];
	for (const path of paths) {
		const absolute = resolve(cwd, path);
		if (seen.has(absolute)) continue;
		seen.add(absolute);
		resolved.push(absolute);
	}
	return resolved;
}
