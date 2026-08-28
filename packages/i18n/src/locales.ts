export const SUPPORTED_LOCALES = ["en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

// Locales written right-to-left. Empty until RTL is in scope; kept here so
// every surface asks the same source instead of hardcoding directionality.
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
		const base = tag.split("-")[0];
		if (base && isSupportedLocale(base)) return base;
	}
	return DEFAULT_LOCALE;
}
