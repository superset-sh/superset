import { isSupportedLocale } from "@superset/i18n";
import { isProfileHandle } from "@superset/trpc/leaderboard-reserved-handles";
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
	const segments = pathname.split("/").slice(1);
	if (segments.length > 1 && segments.at(-1) === "") segments.pop();
	const [first = "", ...rest] = segments;

	if (first === "en") {
		const url = request.nextUrl.clone();
		url.pathname = `/${rest.join("/")}`;
		return NextResponse.redirect(url, 308);
	}

	if (first === "user" && rest.length === 1 && rest[0]) {
		const url = request.nextUrl.clone();
		url.pathname = `/${rest[0].toLowerCase()}`;
		return NextResponse.redirect(url, 308);
	}

	if (isSupportedLocale(first)) {
		const [second = "", ...tail] = rest;

		if (second === "user" && tail.length === 1 && tail[0]) {
			const url = request.nextUrl.clone();
			url.pathname = `/${first}/${tail[0].toLowerCase()}`;
			return NextResponse.redirect(url, 308);
		}

		if (tail.length === 0 && isProfileHandle(second)) {
			const canonical = second.toLowerCase();
			const url = request.nextUrl.clone();
			if (canonical !== second) {
				url.pathname = `/${first}/${canonical}`;
				return NextResponse.redirect(url, 308);
			}
			url.pathname = `/${first}/user/${canonical}`;
			return NextResponse.rewrite(url);
		}
		return;
	}

	if (rest.length === 0 && isProfileHandle(first)) {
		const canonical = first.toLowerCase();
		const url = request.nextUrl.clone();
		if (canonical !== first) {
			url.pathname = `/${canonical}`;
			return NextResponse.redirect(url, 308);
		}
		url.pathname = `/en/user/${canonical}`;
		return NextResponse.rewrite(url);
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
