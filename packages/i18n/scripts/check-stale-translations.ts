/**
 * Explicit message IDs are loosely coupled to their text: when English copy
 * changes under a stable ID, `extract --overwrite` rewrites the source catalog
 * but ja/zh keep translating the *old* wording, and `compile --strict` still
 * passes because nothing is missing. Nothing in Lingui detects that, so this
 * compares the branch against its merge base: if a message's English text
 * moved and a translation did not, the translation is stale.
 *
 * Escape hatch for edits that genuinely don't invalidate a translation (fixing
 * an English typo, say): `locales/en-only-changes.txt`, keyed to the specific
 * new text so a *later* edit re-triggers the check.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRANSLATED_LOCALES = ["ja", "zh-CN"] as const;
const SOURCE_LOCALE = "en";
const EXEMPTIONS_FILE = "locales/en-only-changes.txt";

/** Path of a catalog relative to the repo root, for `git show <ref>:<path>`. */
function catalogPath(locale: string): string {
	return `packages/i18n/locales/${locale}/messages.po`;
}

const UNESCAPE: Record<string, string> = {
	n: "\n",
	t: "\t",
	r: "\r",
	'"': '"',
	"\\": "\\",
};

function unquote(literal: string): string {
	const inner = literal.slice(
		literal.indexOf('"') + 1,
		literal.lastIndexOf('"'),
	);
	return inner.replace(/\\(.)/g, (_, ch: string) => UNESCAPE[ch] ?? ch);
}

/**
 * Minimal PO reader: message id -> translated text. Obsolete `#~` entries are
 * skipped — they describe messages no longer in the source.
 */
export function parsePo(text: string): Map<string, string> {
	const entries = new Map<string, string>();
	let id: string | null = null;
	let value: string | null = null;
	let field: "id" | "str" | null = null;

	const commit = () => {
		if (id && value !== null) entries.set(id, value);
		id = null;
		value = null;
		field = null;
	};

	for (const line of text.split("\n")) {
		if (line.startsWith("#~")) continue;
		if (line.startsWith("msgid ")) {
			commit();
			id = unquote(line);
			field = "id";
		} else if (line.startsWith("msgstr ")) {
			value = unquote(line);
			field = "str";
		} else if (line.startsWith('"')) {
			if (field === "id") id = (id ?? "") + unquote(line);
			else if (field === "str") value = (value ?? "") + unquote(line);
		} else if (line.trim() === "") {
			commit();
		}
	}
	commit();
	return entries;
}

export function fingerprint(text: string): string {
	return createHash("sha1").update(text).digest("hex").slice(0, 8);
}

export interface Catalogs {
	source: Map<string, string>;
	translations: Map<string, Map<string, string>>;
}

export interface StaleMessage {
	id: string;
	before: string;
	after: string;
	locales: string[];
}

/**
 * A translation is stale when its message existed before, its English text
 * changed, and the translation did not. New and deleted messages are left to
 * `compile --strict`, which already fails on anything missing.
 */
export function findStaleTranslations(
	base: Catalogs,
	current: Catalogs,
	exemptions: Map<string, string>,
): StaleMessage[] {
	const stale: StaleMessage[] = [];

	for (const [id, after] of current.source) {
		const before = base.source.get(id);
		if (before === undefined || before === after) continue;
		if (exemptions.get(id) === fingerprint(after)) continue;

		const locales = [...current.translations]
			.filter(([locale, messages]) => {
				const baseText = base.translations.get(locale)?.get(id);
				return baseText !== undefined && baseText === messages.get(id);
			})
			.map(([locale]) => locale);

		if (locales.length > 0) stale.push({ id, before, after, locales });
	}

	return stale.sort((a, b) => a.id.localeCompare(b.id));
}

/** `<message id> <fingerprint of the English text it was granted for>`. */
export function parseExemptions(text: string): Map<string, string> {
	const exemptions = new Map<string, string>();
	for (const line of text.split("\n")) {
		const withoutComment = line.split("#")[0]?.trim() ?? "";
		if (!withoutComment) continue;
		const [id, hash] = withoutComment.split(/\s+/);
		if (id && hash) exemptions.set(id, hash);
	}
	return exemptions;
}

async function git(...args: string[]): Promise<string | null> {
	const proc = Bun.spawn(["git", ...args], {
		cwd: ROOT,
		stdout: "pipe",
		stderr: "ignore",
	});
	const stdout = await new Response(proc.stdout).text();
	return (await proc.exited) === 0 ? stdout : null;
}

/**
 * The commit this branch departed from. On a pull request GitHub names the
 * target branch; otherwise fall back to the remote's default branch, which is
 * what `origin/HEAD` points at.
 */
async function resolveMergeBase(): Promise<string | null> {
	const candidates = process.env.GITHUB_BASE_REF
		? [`origin/${process.env.GITHUB_BASE_REF}`]
		: [
				(
					await git("symbolic-ref", "refs/remotes/origin/HEAD", "--short")
				)?.trim(),
				"origin/main",
			].filter((ref): ref is string => Boolean(ref));

	for (const ref of candidates) {
		const base = (await git("merge-base", ref, "HEAD"))?.trim();
		if (base) return base;
	}
	return null;
}

async function readCatalogs(ref: string | null): Promise<Catalogs | null> {
	const read = async (locale: string) => {
		if (ref === null) {
			return readFileSync(join(ROOT, "locales", locale, "messages.po"), "utf8");
		}
		return await git("show", `${ref}:${catalogPath(locale)}`);
	};

	const source = await read(SOURCE_LOCALE);
	if (source === null) return null;

	const translations = new Map<string, Map<string, string>>();
	for (const locale of TRANSLATED_LOCALES) {
		const text = await read(locale);
		if (text !== null) translations.set(locale, parsePo(text));
	}
	return { source: parsePo(source), translations };
}

function report(stale: StaleMessage[]): void {
	const plural = stale.length === 1 ? "message" : "messages";
	console.error(
		`\n✖ ${stale.length} ${plural} changed in English but not in ${TRANSLATED_LOCALES.join(", ")}:\n`,
	);
	for (const { id, before, after, locales } of stale) {
		console.error(`  ${id}`);
		console.error(`    - ${before}`);
		console.error(`    + ${after}`);
		console.error(`    unchanged in: ${locales.join(", ")}\n`);
	}
	console.error("Update those translations, or — if they are still correct as");
	console.error(`written — add the message to ${EXEMPTIONS_FILE}:\n`);
	for (const { id, after } of stale) {
		console.error(`  ${id} ${fingerprint(after)}`);
	}
	console.error("");
}

async function main(): Promise<void> {
	const base = await resolveMergeBase();
	if (base === null) {
		// Never let a missing base ref quietly pass for a real check: in CI that
		// would be an unfetched history reporting success.
		const message =
			"could not resolve a merge base (needs origin and unshallowed history)";
		if (process.env.CI) {
			console.error(`✖ stale-translation check: ${message}`);
			process.exit(1);
		}
		console.warn(`⚠ skipping stale-translation check: ${message}`);
		return;
	}

	const [baseCatalogs, currentCatalogs] = await Promise.all([
		readCatalogs(base),
		readCatalogs(null),
	]);
	if (baseCatalogs === null || currentCatalogs === null) {
		console.warn("⚠ skipping stale-translation check: no catalogs at the base");
		return;
	}

	let exemptions = new Map<string, string>();
	try {
		exemptions = parseExemptions(
			readFileSync(join(ROOT, EXEMPTIONS_FILE), "utf8"),
		);
	} catch {
		// The file is optional; absent means nothing is exempt.
	}

	const stale = findStaleTranslations(
		baseCatalogs,
		currentCatalogs,
		exemptions,
	);
	if (stale.length === 0) return;
	report(stale);
	process.exit(1);
}

if (import.meta.main) await main();
