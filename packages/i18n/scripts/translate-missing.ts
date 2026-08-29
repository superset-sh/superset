/**
 * Fills untranslated entries in the locale catalogs with Claude.
 *
 * With every locale gated by `compile --strict`, a PR that adds an English
 * string owes a translation in each enabled locale before CI passes. This
 * script closes that gap: it finds every empty msgstr, translates them in one
 * request per locale — anchored to the catalog's own existing translations so
 * register and terminology stay consistent — validates placeholder, tag, and
 * ICU integrity against the English source, and writes back only fills that
 * pass. A fill that fails validation stays empty, so the strict gate still
 * fails loudly rather than shipping a broken string.
 *
 * Usage:
 *   bun scripts/translate-missing.ts             # all enabled locales
 *   bun scripts/translate-missing.ts --locale de # one locale
 *   bun scripts/translate-missing.ts --dry-run   # report, write nothing
 *
 * Auth: ANTHROPIC_API_KEY (or any credential the SDK resolves).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SUPPORTED_LOCALES } from "../src/locales";

const LOCALES_DIR = join(import.meta.dir, "../locales");
const ENTRY = /msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/g;

// Languages with no plural inflection: both ICU branches must carry the same
// text. Slavic locales need the full one/few/many/other set instead.
const NO_PLURAL = new Set([
	"ja",
	"zh-CN",
	"zh-TW",
	"th",
	"id",
	"vi",
	"ko",
	"tr",
]);
const FOUR_BRANCH = new Set(["ru", "pl", "cs"]);

function unescapePo(value: string): string {
	return value
		.replace(/\\"/g, '"')
		.replace(/\\n/g, "\n")
		.replace(/\\\\/g, "\\");
}

function escapePo(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n");
}

function readCatalog(locale: string): Map<string, string> {
	const source = readFileSync(join(LOCALES_DIR, locale, "messages.po"), "utf8");
	const entries = new Map<string, string>();
	for (const match of source.matchAll(ENTRY)) {
		const id = unescapePo(match[1] ?? "");
		if (id) entries.set(id, unescapePo(match[2] ?? ""));
	}
	return entries;
}

// Placeholder, tag-marker, and ICU-keyword integrity. ICU branch bodies are
// prose the translation may reword, so strip ICU blocks before comparing
// simple placeholders.
export function stripIcu(text: string): string {
	let out = "";
	let i = 0;
	while (i < text.length) {
		if (
			text[i] === "{" &&
			/^\{\s*\w+\s*,\s*(plural|select|selectordinal)\b/.test(text.slice(i))
		) {
			let depth = 0;
			while (i < text.length) {
				if (text[i] === "{") depth++;
				else if (text[i] === "}" && --depth === 0) {
					i++;
					break;
				}
				i++;
			}
			continue;
		}
		out += text[i++];
	}
	return out;
}

export function integrityError(
	source: string,
	translation: string,
	locale: string,
): string | null {
	const placeholders = (text: string) =>
		new Set(
			[...stripIcu(text).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]),
		);
	for (const name of placeholders(source)) {
		if (!placeholders(translation).has(name)) return `missing {${name}}`;
	}
	const tags = (text: string) =>
		[...text.matchAll(/<\/?(\d+)\/?>/g)].map((m) => m[0]).sort();
	if (tags(source).join() !== tags(translation).join())
		return "tag markers changed";
	const icu = (text: string) =>
		[...text.matchAll(/\{\s*(\w+)\s*,\s*(plural|select|selectordinal)\b/g)]
			.map((m) => `${m[1]}:${m[2]}`)
			.sort();
	if (icu(source).join() !== icu(translation).join())
		return "ICU structure changed";
	if (FOUR_BRANCH.has(locale) && /\{\s*\w+\s*,\s*plural\s*,/.test(source)) {
		if (!/\bfew\s*\{/.test(translation) || !/\bmany\s*\{/.test(translation)) {
			return "Slavic plural missing few/many branches";
		}
	}
	return null;
}

// A few dozen existing translations of short strings anchor register and
// terminology far better than a glossary we would have to maintain by hand.
function styleAnchors(
	english: Map<string, string>,
	target: Map<string, string>,
): string {
	const anchors: string[] = [];
	for (const [id, en] of english) {
		const translated = target.get(id);
		if (!translated || translated === en) continue;
		if (en.length < 4 || en.length > 80 || en.includes("{")) continue;
		anchors.push(`"${en}" -> "${translated}"`);
		if (anchors.length >= 40) break;
	}
	return anchors.join("\n");
}

async function translateLocale(
	client: Anthropic,
	locale: string,
	english: Map<string, string>,
	dryRun: boolean,
): Promise<{ filled: number; rejected: string[] }> {
	const target = readCatalog(locale);
	const missing = new Map<string, string>();
	for (const [id, en] of english) {
		if (en && target.get(id) === "") missing.set(id, en);
	}
	if (missing.size === 0) return { filled: 0, rejected: [] };

	const pluralRule = NO_PLURAL.has(locale)
		? "This language has no plural inflection: every ICU plural must carry identical text in all branches."
		: FOUR_BRANCH.has(locale)
			? "ICU plurals MUST expand to one/few/many/other with the case this language requires after a numeral. Never copy the two English branches."
			: "Adjust ICU plural branches to what this language grammatically requires.";

	const stream = client.messages.stream({
		model: "claude-opus-5",
		max_tokens: 32000,
		thinking: { type: "adaptive" },
		system: [
			"You translate UI strings for Superset, a desktop IDE for running coding agents.",
			"Audience: professional software engineers. Register: concise developer-tool copy.",
			"Rules that must hold for every string:",
			"- Placeholders like {name} or {0} survive verbatim; never translate the identifier.",
			"- Tag markers <0>…</0> and <1/> stay balanced and wrap the corresponding words.",
			`- ${pluralRule}`,
			"- Brand and product names (Superset, GitHub, Claude, Slack, VS Code, Cursor, …), code, file paths, CLI flags, and keyboard glyphs stay verbatim.",
			"- Match the register, terminology, and vocabulary of the existing translations shown below — they are the source of truth for how this catalog renders recurring terms.",
			"Respond with ONLY a JSON object mapping each message id to its translation. No markdown, no commentary.",
		].join("\n"),
		messages: [
			{
				role: "user",
				content: [
					`Target language: ${locale}`,
					"",
					"Existing translations from this catalog (style and terminology anchors):",
					styleAnchors(english, target),
					"",
					"Translate these entries (id -> English source):",
					JSON.stringify(Object.fromEntries(missing), null, 1),
				].join("\n"),
			},
		],
	});
	const response = await stream.finalMessage();
	const text = response.content
		.filter((block): block is Anthropic.TextBlock => block.type === "text")
		.map((block) => block.text)
		.join("");
	const jsonText = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
	const fills = JSON.parse(jsonText) as Record<string, string>;

	const rejected: string[] = [];
	const accepted = new Map<string, string>();
	for (const [id, en] of missing) {
		const fill = fills[id];
		if (typeof fill !== "string" || fill.length === 0) {
			rejected.push(`${id}: no translation returned`);
			continue;
		}
		const problem = integrityError(en, fill, locale);
		if (problem) {
			rejected.push(`${id}: ${problem}`);
			continue;
		}
		accepted.set(id, fill);
	}

	if (!dryRun && accepted.size > 0) {
		const path = join(LOCALES_DIR, locale, "messages.po");
		let source = readFileSync(path, "utf8");
		for (const [id, fill] of accepted) {
			source = source.replace(
				`msgid "${escapePo(id)}"\nmsgstr ""`,
				`msgid "${escapePo(id)}"\nmsgstr "${escapePo(fill)}"`,
			);
		}
		writeFileSync(path, source);
	}
	return { filled: accepted.size, rejected };
}

if (import.meta.main) await main();

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const localeFlag = process.argv.indexOf("--locale");
	const only = localeFlag !== -1 ? process.argv[localeFlag + 1] : undefined;

	const english = readCatalog("en");
	const client = new Anthropic();
	let failures = 0;

	for (const locale of SUPPORTED_LOCALES) {
		if (locale === "en" || (only && locale !== only)) continue;
		const { filled, rejected } = await translateLocale(
			client,
			locale,
			english,
			dryRun,
		);
		if (filled === 0 && rejected.length === 0) continue;
		console.log(`${locale}: filled ${filled}${dryRun ? " (dry run)" : ""}`);
		for (const reason of rejected) {
			console.error(`  rejected ${reason}`);
			failures++;
		}
	}

	if (failures > 0) {
		console.error(
			`\n${failures} fill(s) rejected — the strict compile will fail on these.`,
		);
		process.exit(1);
	}
}
