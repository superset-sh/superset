import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";

import { env } from "@/env";
import { setPosthogInstance } from "@/lib/analytics/lazy";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

// posthog-js and @sentry/nextjs together add ~200KiB to the initial bundle,
// which tanks the Lighthouse LCP on throttled mobile. Both are dynamically
// imported once the page has loaded (or on first interaction, whichever comes
// first) so they stay off the critical rendering path. Analytics calls made
// before then are queued via withPosthog().

type SentryClient = typeof import("@sentry/nextjs");

let sentryClient: SentryClient | null = null;
let started = false;

async function initPosthog() {
	const { default: posthog } = await import("posthog-js");

	posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
		api_host: "/ingest",
		ui_host: "https://us.posthog.com",
		defaults: "2025-11-30",
		capture_pageview: "history_change",
		capture_pageleave: true,
		capture_exceptions: true,
		debug: false,
		cross_subdomain_cookie: true,
		person_profiles: "always",
		persistence: "cookie",
		persistence_name: POSTHOG_COOKIE_NAME,
		disable_session_recording: true,
		loaded: (posthog) => {
			const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
			if (consent === "declined") {
				posthog.opt_out_capturing();
			}
		},
	});

	posthog.register({
		app_name: "marketing",
		domain: window.location.hostname,
		// The URL decides the language (bare paths are English); the server
		// writes the resolved locale into <html lang>, and every language
		// switch is a full navigation that re-runs this init.
		app_locale: document.documentElement.lang,
		app_locale_source: "url",
	});

	setPosthogInstance(posthog);
}

async function initSentry() {
	const [Sentry, { SENTRY_DENY_URLS, SENTRY_IGNORE_ERRORS }] =
		await Promise.all([
			import("@sentry/nextjs"),
			import("@superset/shared/sentry"),
		]);

	Sentry.init({
		dsn: env.NEXT_PUBLIC_SENTRY_DSN_MARKETING,
		environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
		enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
		tracesSampleRate: 0.01,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0,
		sendDefaultPii: true,
		integrations: [
			Sentry.thirdPartyErrorFilterIntegration({
				filterKeys: ["superset-marketing"],
				behaviour: "drop-error-if-exclusively-contains-third-party-frames",
			}),
		],
		ignoreErrors: SENTRY_IGNORE_ERRORS,
		denyUrls: SENTRY_DENY_URLS,
		debug: false,
	});

	sentryClient = Sentry;
}

function start() {
	if (started) return;
	started = true;
	void initPosthog();
	void initSentry();
}

function scheduleIdle() {
	if ("requestIdleCallback" in window) {
		requestIdleCallback(start, { timeout: 3000 });
	} else {
		setTimeout(start, 1500);
	}
}

if (document.readyState === "complete") {
	scheduleIdle();
} else {
	window.addEventListener("load", scheduleIdle, { once: true });
}
// Don't lose events from visitors who interact before the idle load fires
window.addEventListener("pointerdown", start, { once: true, capture: true });
window.addEventListener("keydown", start, { once: true, capture: true });

export function onRouterTransitionStart(
	href: string,
	navigationType: string,
): void {
	sentryClient?.captureRouterTransitionStart(href, navigationType);
}
