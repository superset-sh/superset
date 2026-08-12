// A path handed to us by a file drop does not always match the file on disk.
// macOS names screenshots with U+202F NARROW NO-BREAK SPACE before am/pm under
// a 12-hour locale, and the path that comes back from the drop can carry a
// plain U+0020 there instead, so nothing can open it (#6369).
//
// The repair below only ever turns a path that does not resolve into one that
// does: it runs when the dropped path is missing, and gives up unless exactly
// one sibling matches once every Unicode space separator is folded to an ASCII
// space. A drop that already points at a real file never reaches it.

/** Unicode space separators (category Zs) plus the ASCII space itself. */
const SPACE_SEPARATOR = /\p{Zs}/gu;

export function foldSpaces(value: string): string {
	return value.replace(SPACE_SEPARATOR, " ");
}

export function splitPath(path: string): { dir: string; base: string } {
	const cut = path.lastIndexOf("/");
	if (cut < 0) return { dir: "", base: path };
	return { dir: path.slice(0, cut), base: path.slice(cut + 1) };
}

/**
 * The on-disk name the dropped basename was meant to point at, or null when
 * the answer is not unique — two candidates mean we cannot tell which file the
 * user dragged, and guessing is worse than leaving the path alone.
 */
export function matchByFoldedName(
	base: string,
	entries: readonly string[],
): string | null {
	const wanted = foldSpaces(base);
	const matches = entries.filter((entry) => foldSpaces(entry) === wanted);
	return matches.length === 1 ? (matches[0] ?? null) : null;
}
