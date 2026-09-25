/**
 * Postgres jsonb rejects U+0000 anywhere in a string ("unsupported Unicode
 * escape sequence"), and GitHub webhook payloads carry them in code diffs.
 */
const NULL_CHAR = String.fromCharCode(0);

export function stripNullChars<T>(value: T): T {
	if (typeof value === "string") {
		return value.replaceAll(NULL_CHAR, "") as T;
	}
	if (Array.isArray(value)) {
		return value.map(stripNullChars) as T;
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key.replaceAll(NULL_CHAR, ""),
				stripNullChars(entry),
			]),
		) as T;
	}
	return value;
}
