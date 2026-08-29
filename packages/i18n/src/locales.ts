export const SUPPORTED_LOCALES = ["en", "ja", "zh-CN", "fr", "ko"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

// Native-language names. A user stuck in a language they cannot read must be
// able to recognize their own in the picker, so these are never translated.
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
	en: "English",
	ja: "日本語",
	"zh-CN": "简体中文",
	fr: "Français",
	ko: "한국어",
};

// Locales written right-to-left. Empty until RTL layout work is in scope; kept
// here so every surface asks the same source instead of hardcoding direction.
export const RTL_LOCALES: ReadonlySet<string> = new Set();

export function isSupportedLocale(value: string): value is SupportedLocale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Picks the first supported locale from a BCP 47 preference list (e.g.
// navigator.languages, app.getPreferredSystemLanguages()), matching on the
// base language when the full tag has no exact match.
export function resolveLocale(preferences: readonly string[]): SupportedLocale {
	for (const tag of preferences) {
		if (isSupportedLocale(tag)) return tag;

		// Exact tag missed: try the base language, then any supported locale
		// sharing it. "zh-Hans-CN" and bare "zh" land on "zh-CN" rather than
		// falling through to English. Region-specific tags win over bare ones,
		// so "pt" reaches "pt-BR".
		const base = tag.split("-")[0];
		if (!base) continue;
		if (isSupportedLocale(base)) return base;
		const sharesBase = SUPPORTED_LOCALES.find(
			(supported) => supported.split("-")[0] === base,
		);
		if (sharesBase) return sharesBase;
	}
	return DEFAULT_LOCALE;
}
