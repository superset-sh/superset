import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";

/**
 * Guards `intl-polyfills.ts` (see `patches/README.md` — a polyfill is a
 * patch by another name, and every one of those needs a test that fails when
 * its markers vanish).
 *
 * The trap this test exists to avoid: bun runs on JavaScriptCore, which
 * implements all of `Intl`. Asserting `typeof Intl.PluralRules === "function"`
 * here passes whether or not the polyfill module does anything at all. So the
 * test must first *delete* what Hermes lacks, then load the module, then check.
 *
 * Measured on Hermes / iOS 26.5, 2026-09-01, by probing the running app:
 *   present: Collator, NumberFormat, DateTimeFormat, getCanonicalLocales
 *   missing: Locale, PluralRules, RelativeTimeFormat, ListFormat, Segmenter,
 *            DisplayNames
 * Re-measure on a React Native upgrade; Hermes grows APIs over time.
 */
const HERMES_MISSING = [
	"Locale",
	"PluralRules",
	"RelativeTimeFormat",
	"ListFormat",
	"Segmenter",
	"DisplayNames",
] as const;

const POLYFILL_SOURCE = readFileSync(
	join(import.meta.dir, "intl-polyfills.ts"),
	"utf8",
);

/** What the module actually installs, read off its import specifiers. */
const polyfilled = new Set(
	[...POLYFILL_SOURCE.matchAll(/@formatjs\/intl-([a-z]+)\/polyfill\.js/g)].map(
		(match) => match[1],
	),
);

type IntlRealm = Record<string, unknown>;
const realm = Intl as unknown as IntlRealm;
const saved = new Map<string, unknown>();

beforeAll(async () => {
	for (const api of HERMES_MISSING) {
		saved.set(api, realm[api]);
		delete realm[api];
	}
	await import("./intl-polyfills");
});

afterAll(() => {
	// Leave the runtime as we found it for anything sharing this process.
	for (const [api, value] of saved) {
		if (value === undefined) delete realm[api];
		else realm[api] = value;
	}
});

describe("mobile Intl polyfills", () => {
	test("installs every API it claims to, on a runtime without them", () => {
		expect(polyfilled.size).toBeGreaterThan(0);
		for (const name of polyfilled) {
			const api = HERMES_MISSING.find((a) => a.toLowerCase() === name);
			expect(api, `unknown @formatjs/intl-${name} polyfill`).toBeDefined();
			expect(typeof realm[api as string], `Intl.${api}`).toBe("function");
		}
	});

	// The regression that shipped: polyfilling PluralRules alone left en/ru/cs/ja
	// working and zh-CN/zh-TW/pt-BR throwing, because intl-pluralrules resolves
	// through intl-localematcher, whose best-fit path calls new Intl.Locale()
	// — and that path is only reached for a tag with a region or script subtag.
	// Exercising every shipped locale is what catches a transitive gap like it.
	test.each([
		...SUPPORTED_LOCALES,
	])("selects a plural category for %s", (locale) => {
		expect(() => new Intl.PluralRules(locale).select(2)).not.toThrow();
	});

	test("carries plural data for every supported locale's base language", () => {
		const loaded = new Set(
			[
				...POLYFILL_SOURCE.matchAll(
					/intl-pluralrules\/locale-data\/([a-zA-Z-]+)\.js/g,
				),
			].map((match) => match[1]),
		);
		const missing = SUPPORTED_LOCALES.map((l) => l.split("-")[0]).filter(
			(base) => !loaded.has(base as string),
		);
		expect(
			missing,
			`intl-polyfills.ts is missing plural data for: ${missing.join(", ")}`,
		).toEqual([]);
	});
});
