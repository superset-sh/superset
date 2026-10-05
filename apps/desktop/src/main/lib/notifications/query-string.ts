/**
 * Query values arrive as string | string[] | object (express parses
 * `?a[b]=1` and repeated keys); the hook protocol only ever sends strings.
 */
export function queryString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
