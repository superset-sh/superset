import { i18n } from "@lingui/core";
import { messages as enMessages } from "../locales/en/messages";
import {
	DEFAULT_LOCALE,
	isSupportedLocale,
	LOCALE_COOKIE,
	resolveLocale,
	type SupportedLocale,
} from "./locales";

export { i18n };
export * from "./locales";

// English is bundled: it is the fallback for any message a translation is
// missing, so it must always be present and available synchronously. Every
// other catalog is loaded on demand — with ~6.9k messages each, bundling all
// of them would add roughly 10 MB to every surface.
//
// The map is spelled out rather than built from a template because bundlers
// only follow `import()` calls they can resolve statically.
const CATALOGS: Record<string, () => Promise<{ messages: typeof enMessages }>> =
	{
		ja: () => import("../locales/ja/messages"),
		"zh-CN": () => import("../locales/zh-CN/messages"),
		fr: () => import("../locales/fr/messages"),
		ko: () => import("../locales/ko/messages"),
		"zh-TW": () => import("../locales/zh-TW/messages"),
		es: () => import("../locales/es/messages"),
		de: () => import("../locales/de/messages"),
		"pt-BR": () => import("../locales/pt-BR/messages"),
		it: () => import("../locales/it/messages"),
		ru: () => import("../locales/ru/messages"),
		tr: () => import("../locales/tr/messages"),
		pl: () => import("../locales/pl/messages"),
		nl: () => import("../locales/nl/messages"),
		id: () => import("../locales/id/messages"),
		cs: () => import("../locales/cs/messages"),
		vi: () => import("../locales/vi/messages"),
	};

const loaded = new Set<string>([DEFAULT_LOCALE]);

function ensureEnglish(): void {
	if (!i18n.messages || Object.keys(i18n.messages).length === 0) {
		i18n.load(DEFAULT_LOCALE, enMessages);
	}
}

// First-load inference: picks the best supported locale from the runtime's
// language preferences (browser/Electron renderer). Platforms without
// navigator.languages (React Native, Node) pass their own preference list to
// resolveLocale/initI18n instead. A persisted user setting takes precedence.
export function inferLocale(): SupportedLocale {
	// An explicit choice from a language switcher outranks browser preferences.
	// Accessed through globalThis so this file typechecks under Node-only lib
	// settings, where the document global does not exist.
	const doc = (globalThis as { document?: { cookie: string } }).document;
	if (doc) {
		const match = doc.cookie.match(
			new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`),
		);
		const chosen = match?.[1];
		if (chosen && isSupportedLocale(chosen)) return chosen;
	}
	if (typeof navigator !== "undefined" && Array.isArray(navigator.languages)) {
		return resolveLocale(navigator.languages);
	}
	return DEFAULT_LOCALE;
}

/** Loads a catalog without activating it. Resolves immediately if cached. */
export async function loadLocale(locale: SupportedLocale): Promise<void> {
	if (loaded.has(locale)) return;
	const load = CATALOGS[locale];
	if (!load) return;
	const { messages } = await load();
	i18n.load(locale, messages);
	loaded.add(locale);
}

/**
 * Activates a locale, awaiting its catalog. Prefer this wherever you can await
 * — the Electron main process at boot, an RSC entry point, a language switch.
 */
export async function initI18nAsync(
	locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<void> {
	i18n.load(DEFAULT_LOCALE, enMessages);
	loaded.add(DEFAULT_LOCALE);
	await loadLocale(locale);
	i18n.activate(locale);
}

/**
 * Synchronous activation, for call sites that cannot await: module scope, and
 * anything that must have *a* locale active before first paint.
 *
 * A locale whose catalog is not loaded yet activates English first and swaps in
 * when the import resolves. Lingui emits a "change" event on that second
 * activation, which `I18nProvider` already subscribes to, so the UI re-renders.
 */
export function initI18n(locale: SupportedLocale = DEFAULT_LOCALE): void {
	ensureEnglish();
	loaded.add(DEFAULT_LOCALE);
	if (loaded.has(locale)) {
		i18n.activate(locale);
		return;
	}
	i18n.activate(DEFAULT_LOCALE);
	loadLocale(locale)
		.then(() => {
			i18n.activate(locale);
		})
		.catch((error: unknown) => {
			// English is already active, so a failed catalog import degrades to
			// the default language rather than crashing the process.
			console.error(`failed to load locale catalog "${locale}"`, error);
		});
}
