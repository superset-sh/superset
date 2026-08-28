import { initI18n, resolveLocale, type SupportedLocale } from "@superset/i18n";
import { app } from "electron";
import { createApplicationMenu } from "main/lib/menu";
import { refreshTrayMenu } from "main/lib/tray";

/** Persisted setting wins; otherwise infer from the OS preference list. */
export function resolveAppLocale(stored: string | null): SupportedLocale {
	return resolveLocale([
		...(stored ? [stored] : []),
		...app.getPreferredSystemLanguages(),
	]);
}

/**
 * Activate a locale in the main process and rebuild the native surfaces whose
 * labels are resolved once at build time — the application menu and the tray
 * menu. Renderer windows re-render on their own via I18nProvider.
 */
export function applyAppLanguage(stored: string | null): void {
	initI18n(resolveAppLocale(stored));
	createApplicationMenu();
	refreshTrayMenu();
}
