import posthogFull from "posthog-js/dist/module.full.no-external";
import type { PostHog } from "posthog-js/react";
import { env } from "../env.renderer";
import { getRendererPostHogKey } from "./desktop-runtime-flags";

// Cast to standard PostHog type for compatibility with posthog-js/react
export const posthog = posthogFull as unknown as PostHog;

export function initPostHog() {
	const postHogKey = getRendererPostHogKey(env.NEXT_PUBLIC_POSTHOG_KEY);
	if (!postHogKey) {
		console.log("[posthog] No key configured, skipping");
		return;
	}

	posthogFull.init(postHogKey, {
		api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
		defaults: "2025-11-30",
		capture_pageview: false,
		capture_pageleave: false,
		capture_exceptions: true,
		person_profiles: "identified_only",
		persistence: "localStorage",
		debug: false,
		loaded: (ph) => {
			ph.register({
				app_name: "desktop",
				platform: window.navigator.platform,
			});
		},
	});
}
