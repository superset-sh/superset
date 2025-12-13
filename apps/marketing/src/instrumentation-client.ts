import { ANALYTICS_CONSENT_KEY } from "@superset/shared/constants";
import posthog from "posthog-js";

import { env } from "@/env";

posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
	api_host: "/ingest",
	ui_host: "https://us.posthog.com",
	defaults: "2025-11-30",
	capture_pageview: "history_change",
	capture_pageleave: true,
	capture_exceptions: true,
	debug: env.NODE_ENV === "development",
	cross_subdomain_cookie: true,
	persistence: "cookie",
	persistence_name: env.NEXT_PUBLIC_COOKIE_DOMAIN,
	opt_out_capturing_by_default: true,
	loaded: (posthog) => {
		posthog.register({
			app_name: "marketing",
			domain: window.location.hostname,
		});

		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === "accepted") {
			posthog.opt_in_capturing();
		}
	},
});
