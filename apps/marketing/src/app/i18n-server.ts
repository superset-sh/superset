import { resolveLocale, type SupportedLocale } from "@superset/i18n";
import {
	initServerI18n as activateServerI18n,
	preloadServerLocale,
} from "@superset/i18n/server";
import { headers } from "next/headers";

// "ja,en-US;q=0.9,en;q=0.8" -> ["ja", "en-US", "en"], ordered by quality.
function parseAcceptLanguage(header: string | null): string[] {
	if (!header) return [];
	return header
		.split(",")
		.map((part) => {
			const [tag, ...params] = part.trim().split(";");
			const q = params
				.map((p) => p.trim())
				.find((p) => p.startsWith("q="))
				?.slice(2);
			const quality = q ? Number.parseFloat(q) : 1;
			return { tag: (tag ?? "").trim(), quality };
		})
		.filter((e) => e.tag && e.tag !== "*" && Number.isFinite(e.quality))
		.sort((a, b) => b.quality - a.quality)
		.map((e) => e.tag);
}

/**
 * Activates i18n for a React Server Components render, in the language the
 * request asked for.
 *
 * A bare seeding call activates the default locale, which renders the whole
 * RSC pass in English no matter what Accept-Language says — client components
 * then re-localize on hydration, so visitors saw English heroes above
 * localized bodies plus a hydration mismatch on every such page. Every route
 * entry must await this (the layout is pruned on client-side navigation, so
 * seeding there covers only full document loads — see @superset/i18n/server).
 *
 * These pages are already dynamically rendered (the nav resolves the session
 * per request), so reading headers() adds no new rendering cost.
 */
export async function initServerI18n(): Promise<SupportedLocale> {
	const acceptLanguage = (await headers()).get("accept-language");
	const locale = resolveLocale(parseAcceptLanguage(acceptLanguage));
	await preloadServerLocale(locale);
	activateServerI18n(locale);
	return locale;
}
