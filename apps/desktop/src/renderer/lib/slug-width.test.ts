import { describe, expect, it } from "bun:test";
import { getSlugColumnWidth } from "./slug-width";

const parseRem = (value: string) => {
	expect(value).toMatch(/rem$/);
	return Number.parseFloat(value);
};

describe("getSlugColumnWidth", () => {
	it("returns a sane default for an empty slug list", () => {
		expect(getSlugColumnWidth([])).toBe("5rem");
	});

	it("scales width with the longest slug length", () => {
		const short = parseRem(getSlugColumnWidth(["AB-1"]));
		const long = parseRem(getSlugColumnWidth(["AB-123456"]));
		expect(long).toBeGreaterThan(short);
	});

	// Regression test for #3727: Linear issue identifiers were rendering as
	// "FUD-..." even though shorter slugs in the same column rendered in full.
	// Root cause: the per-character width estimate was 0.5em (≈6px at text-xs),
	// but proportional sans-serif uppercase letters and digits average closer
	// to 0.6em (≈7px). So the column ended up a few px too narrow for the
	// longest slug, while shorter slugs in the same column still fit.
	it("sizes the column wide enough for the longest slug at text-xs", () => {
		const slugs = ["FUD-1", "FUD-11", "FUD-100", "FUD-12345"];
		const widthRem = parseRem(getSlugColumnWidth(slugs));

		// text-xs is 0.75rem (12px). Slugs are uppercase letters, digits, and a
		// hyphen — characters that need at least ~0.6em on average to render
		// without ellipsis. The column should reserve at least that much per
		// character so the longest slug never truncates.
		const longest = slugs.reduce((max, slug) => Math.max(max, slug.length), 0);
		const minPerChar = 0.6 * 0.75;
		expect(widthRem).toBeGreaterThanOrEqual(longest * minPerChar);
	});
});
