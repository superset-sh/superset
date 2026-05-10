export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_STORAGE_KEY = "superset:locale";

export function isLocale(value: string | undefined | null): value is Locale {
	return value != null && (locales as readonly string[]).includes(value);
}

export function detectInitialLocale(): Locale {
	if (typeof window === "undefined") return defaultLocale;
	const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
	if (isLocale(stored)) return stored;

	const browserPrimary = (window.navigator.language ?? "")
		.split("-")[0]
		?.toLowerCase();
	return isLocale(browserPrimary) ? browserPrimary : defaultLocale;
}
