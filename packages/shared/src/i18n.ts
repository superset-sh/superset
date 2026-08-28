import { i18n, initI18n } from "@superset/i18n";

// packages/shared is imported by the CLI, the host service, and server code,
// none of which mount the React provider that activates a locale — and
// `i18n._` throws outright when no locale is active. Activating the default
// here keeps display helpers safe in those runtimes; a UI process that
// activates its own locale (at `@superset/i18n/react` module scope, or via
// `initI18n` in the Electron main process) still wins, whichever order the
// modules load in.
if (!i18n.locale) {
	initI18n();
}

export { i18n };
