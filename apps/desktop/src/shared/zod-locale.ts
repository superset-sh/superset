import { z } from "zod";
import { en } from "zod/locales";

/**
 * zod ships its English messages as a locale that its own entry module
 * registers with a top-level `config(en())`. That statement does not survive
 * all of our production bundles: on a release build the renderer and main
 * bundles carry no locale at all, so every issue falls back to zod's bare
 * "Invalid input" and the failing check is lost — DESKTOP-151/152/153 each
 * named the field but not what was wrong with it, the difference between
 * "Invalid UUID" and no diagnosis. (The host-service bundle happens to retain
 * the registration, so it does not call this.)
 *
 * Called from app code the registration cannot be tree-shaken. `config()` is
 * read when an issue is formatted, not when a schema is built, so schemas
 * created before this call still get the messages.
 */
export function configureZodLocale(): void {
	z.config(en());
}
