export const GENERIC_FAMILIES = new Set([
	"monospace",
	"sans-serif",
	"serif",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-monospace",
]);

/**
 * Extract the first concrete (non-generic) family from a CSS font-family string.
 * Returns `null` if every entry is a generic family.
 */
export function parsePrimaryFamily(cssValue: string): string | null {
	const families: string[] = [];
	let current = "";
	let inQuote: string | null = null;

	for (const ch of cssValue) {
		if (inQuote) {
			if (ch === inQuote) {
				inQuote = null;
			} else {
				current += ch;
			}
		} else if (ch === '"' || ch === "'") {
			inQuote = ch;
		} else if (ch === ",") {
			const trimmed = current.trim();
			if (trimmed) families.push(trimmed);
			current = "";
		} else {
			current += ch;
		}
	}
	const last = current.trim();
	if (last) families.push(last);

	return families.find((f) => !GENERIC_FAMILIES.has(f.toLowerCase())) ?? null;
}
