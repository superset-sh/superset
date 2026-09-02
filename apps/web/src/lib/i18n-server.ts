// Server components render in Next's RSC module layer, which gets its own copy
// of the shared i18n singleton — the client-side I18nProvider never activates
// it. Activating on import keeps `i18n._()` in a server component from hitting
// Lingui's "no locale activated" throw.
import { initServerI18n } from "@superset/i18n/server";

initServerI18n();

export { i18n } from "@superset/i18n";
