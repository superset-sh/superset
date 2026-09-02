import { isSupportedLocale } from "@superset/i18n";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Locale routing. The whole route tree lives under app/[lang], but English
 * keeps the bare URLs it has always had — every inbound link and its
 * accumulated search equity stays valid:
 *
 * - /pricing        -> rewritten internally to /en/pricing (URL bar unchanged)
 * - /ja/pricing     -> passes through, renders Japanese
 * - /en/pricing     -> 308 to /pricing, so English has exactly one URL
 *
 * Deliberately no Accept-Language redirect: locale auto-redirects hide the
 * localized pages from crawlers (which send en or nothing) and break shared
 * links. Discovery is hreflang, the sitemap, and the visible switcher.
 */
export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const [, first = "", ...rest] = pathname.split("/");

	if (first === "en") {
		const url = request.nextUrl.clone();
		url.pathname = `/${rest.join("/")}`;
		return NextResponse.redirect(url, 308);
	}
	if (isSupportedLocale(first)) {
		return;
	}
	const url = request.nextUrl.clone();
	url.pathname = `/en${pathname}`;
	return NextResponse.rewrite(url);
}

export const config = {
	// Skip Next internals, API routes, the two same-origin analytics proxies,
	// and anything with a file extension (feeds, llms.txt, images, favicon) —
	// those live at the root on purpose.
	//
	// `ingest` (PostHog, via next.config rewrites) and `monitoring` (Sentry's
	// tunnelRoute) are extensionless, so without naming them here they get
	// rewritten to /en/... and 404. That is silent: posthog-js still loads,
	// because /ingest/static/*.js has a dot and slips through this matcher,
	// and then every capture request dies. It cost four days of marketing
	// analytics and Sentry reporting in 2026-08. apps/web and apps/api
	// exclude both for the same reason.
	matcher: ["/((?!_next|api|ingest|monitoring|.*\\..*).*)"],
};
