export const SUPPORTED_LOCALES = [
	"en",
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

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

// Cookie carrying an explicit language choice from a language switcher. Read
// server-side by apps that resolve locale per request (marketing) and by
// inferLocale in the browser, so one choice covers every surface.
export const LOCALE_COOKIE = "superset_locale";

// Native-language names. A user stuck in a language they cannot read must be
// able to recognize their own in the picker, so these are never translated.
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
	en: "English",
	ja: "日本語",
	"zh-CN": "简体中文",
	fr: "Français",
	ko: "한국어",
	"zh-TW": "繁體中文",
	es: "Español",
	de: "Deutsch",
	"pt-BR": "Português (Brasil)",
	it: "Italiano",
	ru: "Русский",
	tr: "Türkçe",
	pl: "Polski",
	nl: "Nederlands",
	id: "Bahasa Indonesia",
	cs: "Čeština",
	vi: "Tiếng Việt",
};

// Locales written right-to-left. Empty until RTL layout work is in scope; kept
// here so every surface asks the same source instead of hardcoding direction.
export const RTL_LOCALES: ReadonlySet<string> = new Set();

export function isSupportedLocale(value: string): value is SupportedLocale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Script and region subtags that pick a variant our locale codes do not spell
// out. We ship Chinese as zh-CN and zh-TW, but a runtime may report the script
// ("zh-Hant") or a different Traditional-script region (Hong Kong, Macau).
// Without these, every Traditional preference falls through to the first zh-*
// in SUPPORTED_LOCALES and a Taiwanese user gets Simplified.
// Keys are lowercase; lookups normalize.
const LOCALE_ALIASES: Readonly<Record<string, SupportedLocale>> = {
	"zh-hant": "zh-TW",
	"zh-hk": "zh-TW",
	"zh-mo": "zh-TW",
	"zh-hans": "zh-CN",
	"zh-sg": "zh-CN",
};

// Picks the first supported locale from a BCP 47 preference list (e.g.
// navigator.languages, app.getPreferredSystemLanguages()), matching on script
// and region subtags before falling back to the base language.
export function resolveLocale(preferences: readonly string[]): SupportedLocale {
	for (const tag of preferences) {
		let parts = tag.toLowerCase().split("-").filter(Boolean);
		// Cut BCP 47 extension and private-use sequences ("zh-TW-u-nu-latn"):
		// everything from the first singleton subtag on modifies formatting,
		// not language identity, and would defeat exact and alias matching.
		const singleton = parts.findIndex((part, i) => i > 0 && part.length === 1);
		if (singleton !== -1) parts = parts.slice(0, singleton);
		const base = parts[0];
		if (!base) continue;

		// Exact match, case-insensitively: a runtime may report "zh-tw".
		const exact = SUPPORTED_LOCALES.find(
			(supported) => supported.toLowerCase() === parts.join("-"),
		);
		if (exact) return exact;

		// Script and region aliases, most specific first, so "zh-Hant-TW"
		// resolves on its script rather than its base language.
		const script = parts.find((part) => part.length === 4);
		const region = parts.length > 1 ? parts[parts.length - 1] : undefined;
		for (const key of [
			parts.join("-"),
			script && `${base}-${script}`,
			region && `${base}-${region}`,
		]) {
			if (key && LOCALE_ALIASES[key]) return LOCALE_ALIASES[key];
		}

		// Then the base language, then any supported locale sharing it. Bare
		// "zh" lands on "zh-CN", and region-specific tags win over bare ones so
		// "pt" reaches "pt-BR".
		if (isSupportedLocale(base)) return base;
		const sharesBase = SUPPORTED_LOCALES.find(
			(supported) => supported.split("-")[0] === base,
		);
		if (sharesBase) return sharesBase;
	}
	return DEFAULT_LOCALE;
}
