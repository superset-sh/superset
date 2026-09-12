import { i18n, initI18n } from "@superset/i18n";

// `i18n._` throws outright when no locale is active, and these components are
// imported outside a mounted `I18nProvider` too — unit tests, Storybook, and
// any module-scope evaluation that beats the provider's own activation.
// Activating the default here keeps those paths on English instead of
// crashing; a host that activates its own locale still wins, whichever order
// the modules load in.
if (!i18n.locale) {
	initI18n();
}

export { i18n };
