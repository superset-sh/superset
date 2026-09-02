import {
	initI18nAsync,
	resolveLocale,
	type SupportedLocale,
} from "@superset/i18n";
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
export async function applyAppLanguage(stored: string | null): Promise<void> {
	// Await the catalog: non-English catalogs load on demand, and the menus
	// below resolve their labels once, at build time. Rebuilding before the
	// load resolves would render them in English.
	await initI18nAsync(resolveAppLocale(stored));
	createApplicationMenu();
	refreshTrayMenu();
}
