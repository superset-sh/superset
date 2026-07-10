export interface TreeShape {
	/** Every directory path implied by the files, sorted shallow→deep (ancestors first). */
	dirs: string[];
	/** Directory path → count of files anywhere beneath it. */
	dirFileCount: Map<string, number>;
}

/** Derive the directory hierarchy + per-directory file counts from a flat list of file paths. */
export function buildTreeShape(paths: string[]): TreeShape {
	const dirs: string[] = [];
	const seen = new Set<string>();
	const dirFileCount = new Map<string, number>();
	for (const path of paths) {
		const segments = path.split("/");
		let acc = "";
		for (let i = 0; i < segments.length - 1; i++) {
			acc = acc ? `${acc}/${segments[i]}` : segments[i];
			if (!seen.has(acc)) {
				seen.add(acc);
				dirs.push(acc);
			}
			dirFileCount.set(acc, (dirFileCount.get(acc) ?? 0) + 1);
		}
	}
	dirs.sort(
		(a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
	);
	return { dirs, dirFileCount };
}
