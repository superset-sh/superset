import { env } from "../../env";

/**
 * A page's canonical public address.
 *
 * Derived from the web app's own URL rather than a separate setting, because
 * the viewer is a route in that app (`/p/<slug>`) and a second variable could
 * only ever drift from it. It also resolves per environment for free —
 * localhost in development, app.superset.sh in production.
 *
 * This deliberately is *not* a domain of its own. A published page is
 * user-authored HTML, so it never executes on this origin: the route renders
 * it inside a sandboxed iframe with an opaque origin. The day pages get a
 * user-content domain, this is the one place that changes.
 */
export function pageUrl(slug: string): string {
	return `${env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "")}/p/${slug}`;
}
