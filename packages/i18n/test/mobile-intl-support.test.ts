import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Mobile runs Hermes, which ships a partial `Intl`. Using an API it lacks
 * throws "undefined cannot be used as a constructor" during render, and there
 * is no error boundary above these screens, so the throw takes the screen down.
 *
 * This scan is default-deny: a runtime `Intl.X` reachable from mobile must be
 * either present in Hermes or installed by `apps/mobile/lib/intl-polyfills/`.
 * Nothing here is hand-maintained except HERMES_BUILTIN, which is measured.
 *
 * It is deliberately paired with `lib/intl-polyfills/intl-polyfills.test.ts`, which
 * covers what a source scan cannot: a gap reached *through* a dependency. The
 * shipped `Intl.Locale` bug was invisible to any grep of our code — it lived in
 * intl-localematcher, pulled in by the plural polyfill itself.
 */
const REPO_ROOT = resolve(import.meta.dir, "../../..");
const MOBILE = join(REPO_ROOT, "apps/mobile");

/**
 * Measured on Hermes / iOS 26.5, 2026-09-01, by probing the running app.
 * Re-measure on a React Native upgrade — Hermes grows APIs over time, and a
 * stale entry here is the one way this scan can wave through a real crash.
 */
const HERMES_BUILTIN = new Set([
	"Collator",
	"DateTimeFormat",
	"NumberFormat",
	"getCanonicalLocales",
]);

/** Every Intl member that exists at runtime; anything else is a type. */
const INTL_RUNTIME_MEMBERS = new Set([
	"Collator",
	"DateTimeFormat",
	"DisplayNames",
	"DurationFormat",
	"ListFormat",
	"Locale",
	"NumberFormat",
	"PluralRules",
	"RelativeTimeFormat",
	"Segmenter",
	"getCanonicalLocales",
	"supportedValuesOf",
]);

const POLYFILL_SOURCE = readFileSync(
	join(MOBILE, "lib/intl-polyfills/intl-polyfills.ts"),
	"utf8",
);

const polyfilled = new Set(
	[...POLYFILL_SOURCE.matchAll(/@formatjs\/intl-([a-z]+)\/polyfill\.js/g)]
		.map(([, pkg]) =>
			[...INTL_RUNTIME_MEMBERS].find((api) => api.toLowerCase() === pkg),
		)
		.filter((api): api is string => api !== undefined),
);

const available = new Set([...HERMES_BUILTIN, ...polyfilled]);

async function scan(dir: string, pattern: RegExp) {
	const hits: { file: string; line: number; api: string }[] = [];
	const glob = new Bun.Glob("**/*.{ts,tsx}");
	for await (const file of glob.scan({ cwd: dir })) {
		if (
			file.startsWith("node_modules/") ||
			file.startsWith("ios/") ||
			file.includes(".test.") ||
			file.includes(".stories.")
		)
			continue;
		const source = readFileSync(join(dir, file), "utf8");
		for (const match of source.matchAll(pattern)) {
			hits.push({
				file,
				line: source.slice(0, match.index).split("\n").length,
				api: match[1] as string,
			});
		}
	}
	return hits;
}

describe("mobile only uses Intl APIs Hermes has or we polyfill", () => {
	test("the polyfill module installs something we recognise", () => {
		expect(polyfilled.size).toBeGreaterThan(0);
	});

	test("no unsupported Intl API in apps/mobile", async () => {
		// Runtime positions only: `Intl.NumberFormatOptions` is a type and erases.
		const hits = await scan(MOBILE, /\bIntl\.([A-Za-z]+)\s*[(.]/g);
		const offenders = hits
			.filter(({ api }) => INTL_RUNTIME_MEMBERS.has(api) && !available.has(api))
			.map(
				({ file, line, api }) =>
					`apps/mobile/${file}:${line} uses Intl.${api}, which Hermes lacks — add @formatjs/intl-${api.toLowerCase()} to lib/intl-polyfills/`,
			);
		expect(offenders).toEqual([]);
	});

	/**
	 * `@superset/i18n/format` is shared with desktop and web, which run engines
	 * with a complete Intl, so an unpolyfilled helper is legal there and fatal
	 * here. Rather than forbid the helper outright, forbid mobile importing one.
	 */
	test("apps/mobile imports no format helper that needs a missing API", async () => {
		const formatSource = readFileSync(
			join(REPO_ROOT, "packages/i18n/src/format/index.ts"),
			"utf8",
		);
		const bodies = new Map<string, string>();
		const parts = formatSource.split(/export function /).slice(1);
		for (const part of parts) {
			const name = part.slice(0, part.indexOf("("));
			bodies.set(name, part);
		}

		const unsafe = new Set<string>();
		for (const [name, body] of bodies) {
			for (const [, api] of body.matchAll(/new Intl\.([A-Za-z]+)\s*\(/g)) {
				if (
					INTL_RUNTIME_MEMBERS.has(api as string) &&
					!available.has(api as string)
				)
					unsafe.add(name);
			}
		}
		// A helper that calls an unsafe helper is itself unsafe.
		for (let changed = true; changed; ) {
			changed = false;
			for (const [name, body] of bodies) {
				if (unsafe.has(name)) continue;
				for (const other of unsafe) {
					if (new RegExp(`\\b${other}\\s*\\(`).test(body)) {
						unsafe.add(name);
						changed = true;
						break;
					}
				}
			}
		}

		const imported = await scan(
			MOBILE,
			/import\s*\{([^}]*)\}\s*from\s*"@superset\/i18n\/format"/g,
		);
		const offenders: string[] = [];
		for (const { file, line, api: clause } of imported) {
			for (const name of clause.split(",").map((s) => s.trim())) {
				if (unsafe.has(name))
					offenders.push(
						`apps/mobile/${file}:${line} imports ${name}(), which needs an Intl API Hermes lacks`,
					);
			}
		}
		expect(offenders).toEqual([]);
	});

	/**
	 * The dependency no grep of our source can see: nothing in SearchScreen says
	 * `Intl.PluralRules` — it says `<Plural>`, and only the compiled catalog
	 * reveals the runtime requirement.
	 */
	test("a catalog containing plurals implies PluralRules is polyfilled", async () => {
		const { messages } = await import("../locales/en/messages.ts");
		const usesPlural = JSON.stringify(messages).includes('"plural"');
		expect(usesPlural).toBe(true);
		expect(available.has("PluralRules")).toBe(true);
	});
});
