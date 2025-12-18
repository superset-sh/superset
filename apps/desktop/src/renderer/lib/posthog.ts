import posthog from "posthog-js/dist/module.full.no-external";
import { env } from "../env.renderer";

export function initPostHog() {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		console.log("[posthog] No key configured, skipping");
		return;
	}

	posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
		api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
		defaults: "2025-11-30",
		capture_pageview: false,
		capture_pageleave: false,
		capture_exceptions: true,
		person_profiles: "identified_only",
		persistence: "localStorage",
		debug: import.meta.env.DEV,
		loaded: (ph) => {
			ph.register({
				app_name: "desktop",
				platform: window.navigator.platform,
			});
		},
	});

	console.log("[posthog] Initialized");
}

export { posthog };
