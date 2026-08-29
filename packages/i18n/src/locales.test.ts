import { describe, expect, test } from "bun:test";
import {
	DEFAULT_LOCALE,
	isSupportedLocale,
	LOCALE_LABELS,
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
		// Icelandic and Faroese: languages we deliberately do not ship, so this
		// keeps testing the fallback rather than the current locale list.
		expect(resolveLocale(["is-IS", "fo"])).toBe(DEFAULT_LOCALE);
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

describe("multi-locale support", () => {
	test("every supported locale has a native label", () => {
		for (const locale of SUPPORTED_LOCALES) {
			expect(LOCALE_LABELS[locale]).toBeTruthy();
		}
	});

	test("matches a regional tag to its supported variant", () => {
		expect(resolveLocale(["zh-Hans-CN"])).toBe("zh-CN");
		expect(resolveLocale(["zh"])).toBe("zh-CN");
		expect(resolveLocale(["ja-JP"])).toBe("ja");
	});

	test("routes Traditional-script Chinese to zh-TW, not the first zh-*", () => {
		// The failure this guards: matching on the base language alone sends
		// every Traditional preference to whichever zh-* is listed first, so a
		// Taiwanese or Hong Kong user is shown Simplified. Chrome and macOS
		// both report the script subtag rather than a bare region.
		expect(resolveLocale(["zh-Hant"])).toBe("zh-TW");
		expect(resolveLocale(["zh-Hant-TW"])).toBe("zh-TW");
		expect(resolveLocale(["zh-HK"])).toBe("zh-TW");
		expect(resolveLocale(["zh-MO"])).toBe("zh-TW");
	});

	test("keeps Simplified-script preferences on zh-CN", () => {
		expect(resolveLocale(["zh-Hans"])).toBe("zh-CN");
		expect(resolveLocale(["zh-SG"])).toBe("zh-CN");
	});

	test("matches tags case-insensitively", () => {
		// navigator.languages is not guaranteed to use canonical casing.
		expect(resolveLocale(["zh-tw"])).toBe("zh-TW");
		expect(resolveLocale(["ZH-HANT"])).toBe("zh-TW");
	});

	test("ignores BCP 47 extension subtags when resolving", () => {
		// "-u-nu-latn" changes numbering, not language identity; it must not
		// defeat the exact or alias match and demote zh-TW to Simplified.
		expect(resolveLocale(["zh-TW-u-nu-latn"])).toBe("zh-TW");
		expect(resolveLocale(["zh-HK-u-nu-latn"])).toBe("zh-TW");
		expect(resolveLocale(["ja-JP-u-ca-japanese"])).toBe("ja");
	});

	test("prefers an earlier preference over a later exact match", () => {
		expect(resolveLocale(["ja", "en"])).toBe("ja");
	});

	test("falls back to English for unsupported languages", () => {
		expect(resolveLocale(["is", "fo"])).toBe("en");
	});
});
