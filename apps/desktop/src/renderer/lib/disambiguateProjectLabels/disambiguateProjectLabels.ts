export interface DisambiguationInput {
	/** Stable identifier for the entry (e.g. projectId). */
	id: string;
	/** Display name — typically the leaf folder name (path basename). */
	name: string;
	/** Absolute filesystem path the name was derived from. */
	path: string;
}

/**
 * Splits a filesystem path into its non-empty segments, handling both POSIX
 * (`/`) and Windows (`\`) separators.
 */
function splitSegments(path: string): string[] {
	return path.split(/[/\\]/).filter(Boolean);
}

/**
 * Computes the minimal trailing parent-path context that makes entry `index`
 * distinguishable from every other entry in `parentSegments`.
 *
 * `parentSegments[i]` is the list of segments of entry `i`'s path *excluding*
 * the leaf (the folder the display name comes from). We grow the number of
 * trailing parent segments `k` until entry `index`'s suffix is unique, then
 * join those segments back into a path fragment (e.g. `"client-a"`).
 */
function computeContext(
	parentSegments: string[][],
	index: number,
): string | null {
	const mine = parentSegments[index];
	if (mine.length === 0) return null;

	const others = parentSegments.filter((_, i) => i !== index);

	for (let k = 1; k <= mine.length; k++) {
		const mySuffix = mine.slice(mine.length - k);
		const suffixKey = mySuffix.join("/");
		const collides = others.some((other) => {
			const otherSuffix = other.slice(Math.max(0, other.length - k));
			return otherSuffix.join("/") === suffixKey;
		});
		if (!collides) return mySuffix.join("/");
	}

	// Paths share every parent segment (e.g. one is a suffix of the other);
	// fall back to the full parent path so the entry is still distinguishable.
	return mine.join("/");
}

/**
 * Given a set of entries whose display names are derived from filesystem paths,
 * returns a map from entry id to a disambiguating parent-path fragment.
 *
 * The fragment is `null` when the entry's name is already unique. When two or
 * more entries share the same name (e.g. two repos both named `app` living at
 * different paths), each colliding entry gets the smallest slice of its parent
 * path needed to tell it apart from the others.
 *
 * Example: `~/projects/client-a/app` and `~/projects/client-b/app` (both named
 * `app`) yield `"client-a"` and `"client-b"` respectively.
 */
export function disambiguateProjectLabels(
	entries: DisambiguationInput[],
): Map<string, string | null> {
	const result = new Map<string, string | null>();

	const byName = new Map<string, DisambiguationInput[]>();
	for (const entry of entries) {
		const group = byName.get(entry.name);
		if (group) {
			group.push(entry);
		} else {
			byName.set(entry.name, [entry]);
		}
	}

	for (const group of byName.values()) {
		if (group.length < 2) {
			for (const entry of group) result.set(entry.id, null);
			continue;
		}

		const parentSegments = group.map((entry) =>
			splitSegments(entry.path).slice(0, -1),
		);
		for (let i = 0; i < group.length; i++) {
			result.set(group[i].id, computeContext(parentSegments, i));
		}
	}

	return result;
}
