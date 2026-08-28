import { i18n } from "@lingui/core";
import { messages as enMessages } from "../locales/en/messages";
import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from "./locales";

export { i18n };
export * from "./locales";

let activated = false;

// First-load inference: picks the best supported locale from the runtime's
// language preferences (browser/Electron renderer). Platforms without
// navigator.languages (React Native, Node) pass their own preference list to
// resolveLocale/initI18n instead. Once a persisted user setting exists
// (Phase 1), it takes precedence over this.
export function inferLocale(): SupportedLocale {
	if (typeof navigator !== "undefined" && Array.isArray(navigator.languages)) {
		return resolveLocale(navigator.languages);
	}
	return DEFAULT_LOCALE;
}

// Loads the default catalog and activates a locale on the shared i18n
// instance. Safe to call more than once; English is always loaded so missing
// translations fall back to source text.
export function initI18n(locale: SupportedLocale = DEFAULT_LOCALE): void {
	if (!activated) {
		i18n.load(DEFAULT_LOCALE, enMessages);
		activated = true;
	}
	i18n.activate(locale);
}
