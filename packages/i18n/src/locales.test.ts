import { describe, expect, test } from "bun:test";
import {
	DEFAULT_LOCALE,
	isSupportedLocale,
	resolveLocale,
	SUPPORTED_LOCALES,
} from "./locales";

describe("resolveLocale", () => {
	test("exact match wins", () => {
		expect(resolveLocale(["en"])).toBe("en");
	});

	test("falls back to base language for regional tags", () => {
		expect(resolveLocale(["en-GB"])).toBe("en");
		expect(resolveLocale(["en-US", "fr-FR"])).toBe("en");
	});

	test("unsupported preferences fall back to the default locale", () => {
		expect(resolveLocale(["de-DE", "fr"])).toBe(DEFAULT_LOCALE);
		expect(resolveLocale([])).toBe(DEFAULT_LOCALE);
	});

	test("earlier preferences take precedence", () => {
		// When more locales ship, the first supported preference must win;
		// today this degenerates to finding "en" anywhere in the list.
		expect(resolveLocale(["zz", "en-AU"])).toBe("en");
	});
});

describe("isSupportedLocale", () => {
	test("accepts every supported locale and rejects others", () => {
		for (const locale of SUPPORTED_LOCALES) {
			expect(isSupportedLocale(locale)).toBe(true);
		}
		expect(isSupportedLocale("en-US")).toBe(false);
		expect(isSupportedLocale("")).toBe(false);
	});
});
