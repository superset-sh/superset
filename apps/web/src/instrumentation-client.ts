import * as Sentry from "@sentry/nextjs";
import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
import {
	SENTRY_DENY_URLS,
	SENTRY_IGNORE_ERRORS,
} from "@superset/shared/sentry";
import posthog from "posthog-js";

import { env } from "@/env";
import { registerBaseProperties } from "@/lib/posthog-client";

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
});

registerBaseProperties();

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_WEB,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	tracesSampleRate: 0.05,
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 0,
	sendDefaultPii: true,
	debug: false,
	// Drops events whose stacks contain no frames from our bundles (extension
	// and wallet-injected code). Requires applicationKey in next.config.ts.
	integrations: [
		Sentry.thirdPartyErrorFilterIntegration({
			filterKeys: ["superset-web"],
			behaviour: "drop-error-if-exclusively-contains-third-party-frames",
		}),
	],
	ignoreErrors: SENTRY_IGNORE_ERRORS,
	denyUrls: SENTRY_DENY_URLS,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
