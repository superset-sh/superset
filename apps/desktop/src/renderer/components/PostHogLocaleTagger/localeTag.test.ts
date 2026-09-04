import { describe, expect, test } from "bun:test";
import { resolveLocaleTag } from "./localeTag";

describe("resolveLocaleTag", () => {
	test("waits for the setting to load", () => {
		expect(
			resolveLocaleTag({
				activeLocale: "en",
				language: undefined,
				inferredLocale: "en",
			}),
		).toBeNull();
	});

	test("Auto tags the inferred system language as system", () => {
		expect(
			resolveLocaleTag({
				activeLocale: "ja",
				language: null,
				inferredLocale: "ja",
			}),
		).toEqual({ app_locale: "ja", app_locale_source: "system" });
	});

	test("a pinned language is tagged as setting", () => {
		expect(
			resolveLocaleTag({
				activeLocale: "fr",
				language: "fr",
				inferredLocale: "en",
			}),
		).toEqual({ app_locale: "fr", app_locale_source: "setting" });
	});

	test("skips the transitional English while a catalog loads", () => {
		expect(
			resolveLocaleTag({
				activeLocale: "en",
				language: null,
				inferredLocale: "ja",
			}),
		).toBeNull();
		expect(
			resolveLocaleTag({
				activeLocale: "en",
				language: "zh-CN",
				inferredLocale: "en",
			}),
		).toBeNull();
	});

	test("pinning English on a non-English system is a setting", () => {
		expect(
			resolveLocaleTag({
				activeLocale: "en",
				language: "en",
				inferredLocale: "de",
			}),
		).toEqual({ app_locale: "en", app_locale_source: "setting" });
	});
});
