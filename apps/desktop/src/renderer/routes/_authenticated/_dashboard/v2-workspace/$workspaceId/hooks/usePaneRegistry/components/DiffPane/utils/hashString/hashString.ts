/** 32-bit FNV-1a. Cheap enough to run over a multi-megabyte string once per
 * fetch, and stable across renders, so it keys versions and revisions. A
 * different seed and prime give an independent second hash of the same
 * string. */
export function hashString(
	value: string,
	seed = 2166136261,
	prime = 16777619,
): number {
	let hash = seed;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, prime);
	}
	return hash >>> 0;
}
