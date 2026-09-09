/** 32-bit FNV-1a. Cheap enough to run over a multi-megabyte string once per
 * fetch, and stable across renders, so it keys versions and revisions. */
export function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
