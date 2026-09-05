// Hosts and path conventions shared by the growth queries. The marketing site
// and docs are the surfaces growth work lands on; the app hosts are product
// usage and belong to the product tiles.
export const MARKETING_HOSTS = ["superset.sh", "www.superset.sh"] as const;
export const DOCS_HOST = "docs.superset.sh";
export const SITE_HOSTS = [...MARKETING_HOSTS, DOCS_HOST] as const;

// Referring domains that mean "an assistant answered a prompt with a link to
// us". PostHog's own `$channel_type = 'AI'` catches some of these; the list
// covers the ones it misses, and both are unioned in queries.
export const AI_ASSISTANT_DOMAINS = [
	"chatgpt.com",
	"chat.openai.com",
	"claude.ai",
	"gemini.google.com",
	"notebooklm.google.com",
	"perplexity.ai",
	"www.perplexity.ai",
	"copilot.microsoft.com",
	"you.com",
	"chat.mistral.ai",
	"grok.com",
	"chat.deepseek.com",
	"poe.com",
	"meta.ai",
] as const;

// Mirrors SUPPORTED_LOCALES in packages/i18n minus "en": localized marketing
// URLs carry the locale as the first path segment and the growth tiles count
// a page once across languages. Kept as an explicit list rather than a
// generic two-letter pattern so a real route like /md is not mistaken for one.
export const LOCALE_PREFIXES = [
	"ja",
	"zh-CN",
	"fr",
	"ko",
	"zh-TW",
	"es",
	"de",
	"pt-BR",
	"it",
	"ru",
	"tr",
	"pl",
	"nl",
	"id",
	"cs",
	"vi",
] as const;

export const CONTENT_SECTIONS = [
	"home",
	"compare",
	"blog",
	"changelog",
	"docs",
	"other",
] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export function sqlList(values: readonly string[]): string {
	return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
}

// HogQL regexes are RE2 string literals: every backslash must survive the SQL
// string literal, so `\.` in the regex is `\\.` in the query text.
const LOCALE_ALTERNATION = LOCALE_PREFIXES.join("|");

/** HogQL expression that strips a leading locale segment from `column`. */
export function stripLocaleSql(column: string): string {
	return `replaceRegexpOne(replaceRegexpOne(${column}, '^/(${LOCALE_ALTERNATION})/', '/'), '^/(${LOCALE_ALTERNATION})$', '/')`;
}

/** HogQL predicate: `column` is under `/segment` in any locale. */
export function sectionMatchSql(column: string, segment: string): string {
	return `match(${column}, '^(/(${LOCALE_ALTERNATION}))?/${segment}(/|$)')`;
}

// Our own hosts show up under PostHog's AI channel for in-app links, so the
// channel match is narrowed to external referrers.
export function isAiAssistantSql(column: string): string {
	return `(${column} IN (${sqlList(AI_ASSISTANT_DOMAINS)}) OR ($channel_type = 'AI' AND NOT match(${column}, 'superset\\\\.sh|boid\\\\.so')))`;
}
