import { describe, expect, test } from "bun:test";
import {
	generateBasePageSlug,
	generatePageSlugSuffix,
	mintPageSlug,
} from "./page-slug";

// Deterministic stand-in for crypto.getRandomValues so slug output is assertable.
function fixedRandom(...values: number[]): (length: number) => Uint8Array {
	return (length) => Uint8Array.from({ length }, (_, i) => values[i] ?? 0);
}

describe("generateBasePageSlug", () => {
	test("lowercases and joins words with hyphens", () => {
		expect(generateBasePageSlug("Q3 Launch Microsite")).toBe(
			"q3-launch-microsite",
		);
	});

	test("collapses runs of punctuation into a single hyphen", () => {
		expect(generateBasePageSlug("Hello --- World!!!")).toBe("hello-world");
	});

	test("strips leading and trailing separators", () => {
		expect(generateBasePageSlug("  ...spaced out...  ")).toBe("spaced-out");
	});

	test("falls back to 'page' when nothing survives slugification", () => {
		expect(generateBasePageSlug("！！！")).toBe("page");
		expect(generateBasePageSlug("")).toBe("page");
	});

	test("truncates to 50 characters without leaving a trailing hyphen", () => {
		// 49 a's puts the separator exactly on the 50-char boundary, which would
		// otherwise leave "...a-" and a double hyphen once the suffix lands.
		const slug = generateBasePageSlug(`${"a".repeat(49)} tail`);
		expect(slug).toBe("a".repeat(49));
		expect(slug.endsWith("-")).toBe(false);
	});
});

describe("generatePageSlugSuffix", () => {
	test("is five characters from the readable alphabet", () => {
		const suffix = generatePageSlugSuffix();
		expect(suffix).toMatch(/^[a-z0-9]{5}$/);
	});

	test("maps random bytes through the alphabet", () => {
		// 0 -> 'a', 1 -> 'b', 36 wraps back to 'a', 35 -> '9'.
		expect(generatePageSlugSuffix(fixedRandom(0, 1, 36, 35, 2))).toBe("aba9c");
	});
});

describe("mintPageSlug", () => {
	test("always appends a suffix, even when no collision exists", () => {
		expect(
			mintPageSlug("Q3 Launch Microsite", fixedRandom(23, 6, 5, 1, 0)),
		).toBe("q3-launch-microsite-xgfba");
	});

	test("gives two pages with the same title different slugs", () => {
		const first = mintPageSlug("Report", fixedRandom(0, 0, 0, 0, 0));
		const second = mintPageSlug("Report", fixedRandom(1, 1, 1, 1, 1));
		expect(first).not.toBe(second);
		expect(first).toBe("report-aaaaa");
		expect(second).toBe("report-bbbbb");
	});
});
