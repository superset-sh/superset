import { isSupportedLocale, type SupportedLocale } from "@superset/i18n";
import {
	initServerI18n as activateServerI18n,
	preloadServerLocale,
} from "@superset/i18n/server";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";

/**
 * Activates i18n for a React Server Components render, in the language the
 * URL names.
 *
 * The locale is structural: every route lives under app/[lang], src/proxy.ts
 * rewrites bare (English) URLs to /en internally, and this helper reads the
 * segment through next/root-params — one source of truth for every server
 * component and utility, no header or cookie sniffing. An unsupported
 * segment that survives the proxy (direct render, misconfigured matcher)
 * 404s here rather than silently serving the default language.
 *
 * Every route entry must await this — the layout is pruned on client-side
 * navigation, so seeding there covers only full document loads (see
 * @superset/i18n/server; enforced by packages/i18n/test/rsc-seeding.test.ts).
 */
export async function initServerI18n(): Promise<SupportedLocale> {
	const locale = await lang();
	if (!locale || !isSupportedLocale(locale)) notFound();
	await preloadServerLocale(locale);
	activateServerI18n(locale);
	return locale;
}
