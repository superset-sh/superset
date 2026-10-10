const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** `github.com/x` → `https://github.com/x`; http(s) kept; any other scheme (javascript:, data:) → null. */
export function toWebUrl(value: string): string | null {
	const trimmed = value.trim();
	const scheme = SCHEME.exec(trimmed)?.[1]?.toLowerCase();
	if (!scheme) return `https://${trimmed}`;
	return scheme === "http" || scheme === "https" ? trimmed : null;
}
