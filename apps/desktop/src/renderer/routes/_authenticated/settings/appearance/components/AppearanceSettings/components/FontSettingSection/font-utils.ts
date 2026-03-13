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
	const families = cssValue
		.split(",")
		.map((f) => f.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean);

	return families.find((f) => !GENERIC_FAMILIES.has(f.toLowerCase())) ?? null;
}
