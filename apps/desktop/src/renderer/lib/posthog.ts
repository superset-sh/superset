import posthog from "posthog-js/dist/module.full.no-external";

const POSTHOG_KEY = import.meta.env.NEXT_PUBLIC_POSTHOG_KEY as
	| string
	| undefined;

export function initPostHog() {
	if (!POSTHOG_KEY) {
		console.log("[posthog] No key configured, skipping");
		return;
	}

	posthog.init(POSTHOG_KEY, {
		api_host: "https://us.i.posthog.com",
		ui_host: "https://us.posthog.com",
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
