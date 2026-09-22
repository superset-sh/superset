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

/** The MDX bodies and production-run essay currently exist only in English. */
export function hasLocalizedContent(path: string): boolean {
	return !(
		/^\/(blog|changelog|compare)\/[^/]+$/.test(path) ||
		[
			"/agent-orchestration",
			"/parallel-coding-agents",
			"/privacy",
			"/security",
			"/subprocessors",
			"/terms",
			"/the-production-run",
		].includes(path)
	);
}

/**
 * Translated pages name their locale siblings. An English-only article keeps
 * its English canonical even when rendered inside translated navigation.
 */
export function localizedAlternates(
	lang: SupportedLocale,
	path: string,
): NonNullable<Metadata["alternates"]> {
	if (!hasLocalizedContent(path)) {
		return { canonical: localeUrl("en", path) };
	}

	const languages: Record<string, string> = {
		"x-default": localeUrl("en", path),
	};
	for (const locale of SUPPORTED_LOCALES) {
		languages[locale] = localeUrl(locale, path);
	}
	return { canonical: localeUrl(lang, path), languages };
}
