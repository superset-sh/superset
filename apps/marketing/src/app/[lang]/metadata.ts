import { SUPPORTED_LOCALES, type SupportedLocale } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";

// English lives at the bare URL (Decision 1 of the localized-URLs plan:
// every inbound link keeps working); other locales take a path prefix.
export function localeUrl(lang: SupportedLocale, path: string): string {
	const suffix = path === "/" ? "" : path;
	return lang === "en"
		? `${COMPANY.MARKETING_URL}${suffix || "/"}`
		: `${COMPANY.MARKETING_URL}/${lang}${suffix}`;
}

/**
 * Canonical + hreflang alternates for one page. Every locale URL names all
 * of its siblings, and x-default points at the bare English URL, which is
 * what tells search engines the set are translations of one page.
 */
export function localizedAlternates(
	lang: SupportedLocale,
	path: string,
): NonNullable<Metadata["alternates"]> {
	const languages: Record<string, string> = {
		"x-default": localeUrl("en", path),
	};
	for (const locale of SUPPORTED_LOCALES) {
		languages[locale] = localeUrl(locale, path);
	}
	return { canonical: localeUrl(lang, path), languages };
}
