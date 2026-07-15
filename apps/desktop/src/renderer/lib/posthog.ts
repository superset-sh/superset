import { setRelaySocketTelemetry } from "@superset/workspace-client";
import posthogFull from "posthog-js/dist/module.full.no-external";
import type { PostHog } from "posthog-js/react";
import { env } from "../env.renderer";

// Cast to standard PostHog type for compatibility with posthog-js/react
export const posthog = posthogFull as unknown as PostHog;

export function initPostHog() {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		console.log("[posthog] No key configured, skipping");
		return;
	}

	posthogFull.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
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
				// Event-level version (person-profile desktop_version reflects the
				// current install, not the build that emitted a given event).
				app_version: window.App.appVersion,
				platform: window.navigator.platform,
			});
		},
	});

	// Relay socket health (event bus / workspace "disconnected" surface). At
	// most one event per outage episode plus one on recovery.
	setRelaySocketTelemetry((event) => {
		posthogFull.capture(`relay_ws_${event.kind}`, {
			socket_name: event.socketName,
			endpoint: event.endpoint,
			preflight_status: event.preflightStatus,
			tunnel_region: event.tunnelRegion,
			close_code: event.closeCode,
			close_reason: event.closeReason,
			reconnect_attempts: event.failedAttempts,
			outage_ms: event.outageMs,
		});
	});
}
