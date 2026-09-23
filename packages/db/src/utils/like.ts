/**
 * Escapes the wildcards in a user-supplied LIKE/ILIKE term, so searching for
 * "100%" matches that text instead of every row.
 */
export function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
