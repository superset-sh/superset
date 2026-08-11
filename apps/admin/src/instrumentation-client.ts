import * as Sentry from "@sentry/nextjs";
import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
import {
	SENTRY_DENY_URLS,
	SENTRY_IGNORE_ERRORS,
} from "@superset/shared/sentry";
import posthog from "posthog-js";

import { env } from "@/env";

posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
	api_host: "/ingest",
	ui_host: "https://us.posthog.com",
	defaults: "2025-11-30",
	capture_pageview: "history_change",
	capture_pageleave: true,
	capture_exceptions: true,
	debug: false,
	cross_subdomain_cookie: true,
	persistence: "cookie",
	persistence_name: POSTHOG_COOKIE_NAME,
	loaded: (posthog) => {
		posthog.register({
			app_name: "admin",
			domain: window.location.hostname,
		});
	},
});

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: !!env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,
	tracesSampleRate: 0.05,
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 0,
	sendDefaultPii: true,
	integrations: [
		Sentry.thirdPartyErrorFilterIntegration({
			filterKeys: ["superset-admin"],
			behaviour: "drop-error-if-exclusively-contains-third-party-frames",
		}),
	],
	ignoreErrors: SENTRY_IGNORE_ERRORS,
	denyUrls: SENTRY_DENY_URLS,
	debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
