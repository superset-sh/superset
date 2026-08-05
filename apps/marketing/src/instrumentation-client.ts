import * as Sentry from "@sentry/nextjs";
import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
import {
	SENTRY_DENY_URLS,
	SENTRY_IGNORE_ERRORS,
} from "@superset/shared/sentry";
import posthog from "posthog-js";

import { env } from "@/env";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

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
});

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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
