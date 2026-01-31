import * as Sentry from "@sentry/nextjs";
import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
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
	persistence: "cookie",
	persistence_name: POSTHOG_COOKIE_NAME,
	loaded: (posthog) => {
		posthog.register({
			app_name: "marketing",
			domain: window.location.hostname,
		});

		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === "declined") {
			posthog.opt_out_capturing();
		}
	},
});

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_MARKETING,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	tracesSampleRate:
		env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
	sendDefaultPii: true,
	debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
