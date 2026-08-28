import { i18n } from "@lingui/core";
import { messages as enMessages } from "../locales/en/messages";
import { messages as jaMessages } from "../locales/ja/messages";
import { messages as zhCNMessages } from "../locales/zh-CN/messages";
import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from "./locales";

export { i18n };
export * from "./locales";

// Catalogs are imported statically rather than dynamically: activation has to
// be synchronous (it happens at module scope, before first paint, and inside
// the Electron main process where there is no render pass to await on), and
// a missing catalog would silently fall back to English mid-session.
const CATALOGS: Record<SupportedLocale, typeof enMessages> = {
	en: enMessages,
	ja: jaMessages,
	"zh-CN": zhCNMessages,
};

let loaded = false;

// First-load inference: picks the best supported locale from the runtime's
// language preferences (browser/Electron renderer). Platforms without
// navigator.languages (React Native, Node) pass their own preference list to
// resolveLocale/initI18n instead. A persisted user setting takes precedence
// over this.
export function inferLocale(): SupportedLocale {
	if (typeof navigator !== "undefined" && Array.isArray(navigator.languages)) {
		return resolveLocale(navigator.languages);
	}
	return DEFAULT_LOCALE;
}

// Loads every catalog and activates a locale on the shared i18n instance.
// Safe to call more than once; English is always loaded so a message missing
// from a translation falls back to its source text rather than its ID.
export function initI18n(locale: SupportedLocale = DEFAULT_LOCALE): void {
	if (!loaded) {
		for (const [code, messages] of Object.entries(CATALOGS)) {
			i18n.load(code, messages);
		}
		loaded = true;
	}
	i18n.activate(locale);
}
