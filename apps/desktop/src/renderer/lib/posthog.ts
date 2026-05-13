import type { PostHogConfig } from "posthog-js/dist/module.full.no-external";
import posthogFull from "posthog-js/dist/module.full.no-external";
import type { PostHog } from "posthog-js/react";
import { env } from "../env.renderer";
import {
	TERMINAL_SESSION_REPLAY_BLOCK_ATTRIBUTE,
	TERMINAL_SESSION_REPLAY_BLOCK_CLASS,
} from "./terminal/terminal-session-replay";

// Cast to standard PostHog type for compatibility with posthog-js/react
export const posthog = posthogFull as unknown as PostHog;

export const POSTHOG_SESSION_REPLAY_BLOCK_SELECTOR = [
	`.${TERMINAL_SESSION_REPLAY_BLOCK_CLASS}`,
	`[${TERMINAL_SESSION_REPLAY_BLOCK_ATTRIBUTE}]`,
	"[data-ph-no-capture]",
	"[data-terminal-webgl-canvas]",
	".xterm",
	".xterm-screen",
	".xterm-viewport",
	".xterm-helper-textarea",
].join(", ");

export function buildPostHogInitConfig(): Partial<PostHogConfig> {
	return {
		api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
		defaults: "2025-11-30",
		autocapture: false,
		capture_pageview: false,
		capture_pageleave: false,
		capture_exceptions: true,
		disable_scroll_properties: true,
		disable_session_recording: true,
		person_profiles: "identified_only",
		persistence: "localStorage",
		debug: false,
		session_recording: {
			blockSelector: POSTHOG_SESSION_REPLAY_BLOCK_SELECTOR,
			captureCanvas: {
				recordCanvas: false,
				canvasFps: 0,
				canvasQuality: "0",
			},
		},
		loaded: (ph) => {
			ph.register({
				app_name: "desktop",
				platform: window.navigator.platform,
			});
		},
	};
}

export function initPostHog() {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		console.log("[posthog] No key configured, skipping");
		return;
	}

	posthogFull.init(env.NEXT_PUBLIC_POSTHOG_KEY, buildPostHogInitConfig());
}
