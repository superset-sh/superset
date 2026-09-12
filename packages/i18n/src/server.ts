import "server-only";

import { type I18n, setupI18n } from "@lingui/core";
import { setI18n } from "@lingui/react/server";
import { messages as enMessages } from "../locales/en/messages";
import { getLocaleMessages } from "./index";
import { DEFAULT_LOCALE, type SupportedLocale } from "./locales";

// One instance per locale, as in Lingui's Next.js App Router example:
// https://lingui.dev/tutorials/react-rsc
// Never activate a different locale on these shared instances. setI18n binds
// the selected instance to React's request-local cache, not a global locale.
const instances = new Map<SupportedLocale, I18n>([
	[
		DEFAULT_LOCALE,
		setupI18n({
			locale: DEFAULT_LOCALE,
			messages: { [DEFAULT_LOCALE]: enMessages },
		}),
	],
]);

export function getI18nInstance(
	locale: SupportedLocale = DEFAULT_LOCALE,
): I18n {
	const instance = instances.get(locale);
	if (!instance) {
		throw new Error(
			`Preload the server catalog for "${locale}" before rendering.`,
		);
	}
	return instance;
}

/**
 * Bind a preloaded locale to this RSC render. Call in every page and layout:
 * layouts do not run again on client navigation. Keep the returned instance
 * for imperative translations (metadata, utilities) across await boundaries.
 */
export function initServerI18n(locale: SupportedLocale = DEFAULT_LOCALE): I18n {
	const instance = getI18nInstance(locale);
	setI18n(instance);
	return instance;
}

/** Load catalogs on demand without changing any existing instance's locale. */
export async function preloadServerLocale(
	locale: SupportedLocale,
): Promise<void> {
	if (instances.has(locale)) return;
	const messages = await getLocaleMessages(locale);
	// Another request may have finished loading this locale while we awaited.
	if (!instances.has(locale)) {
		instances.set(
			locale,
			setupI18n({ locale, messages: { [locale]: messages } }),
		);
	}
}
