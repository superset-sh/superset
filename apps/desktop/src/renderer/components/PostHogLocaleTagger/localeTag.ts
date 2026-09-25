export interface LocaleTag {
	app_locale: string;
	app_locale_source: "setting" | "system";
}

/**
 * What to tag events with, or null while the answer is not known yet:
 * the setting has not loaded (`language === undefined`), or a non-English
 * catalog is still loading and English is on screen in the meantime.
 */
export function resolveLocaleTag({
	activeLocale,
	language,
	inferredLocale,
}: {
	activeLocale: string;
	language: string | null | undefined;
	inferredLocale: string;
}): LocaleTag | null {
	if (language === undefined) return null;
	if (activeLocale !== (language ?? inferredLocale)) return null;
	return {
		app_locale: activeLocale,
		app_locale_source: language ? "setting" : "system",
	};
}
