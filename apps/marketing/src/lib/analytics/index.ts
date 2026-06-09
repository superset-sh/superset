import posthog from "posthog-js";

import { trackReddit } from "./reddit";

/**
 * PostHog events that should also be forwarded to the Reddit Pixel as
 * conversion events. Keyed by PostHog event name → Reddit standard event.
 * `download_clicked` fires whenever a visitor hits a download CTA (across all
 * platforms), which is the conversion we optimize Reddit ads toward.
 */
const REDDIT_EVENT_MAP: Record<string, string> = {
	download_clicked: "Purchase",
};

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);

	const redditEvent = REDDIT_EVENT_MAP[event];
	if (redditEvent) {
		trackReddit(redditEvent, properties);
	}
}
