import type { PostHog } from "posthog-js";

type PosthogCallback = (posthog: PostHog) => void;

let instance: PostHog | null = null;
const queue: PosthogCallback[] = [];

/**
 * Runs the callback with the PostHog instance once it has loaded. posthog-js
 * is dynamically imported after page load (see instrumentation-client.ts) so
 * it stays off the critical rendering path; calls made before then are queued
 * and flushed in order when it arrives.
 */
export function withPosthog(callback: PosthogCallback): void {
	if (instance) {
		callback(instance);
	} else {
		queue.push(callback);
	}
}

export function setPosthogInstance(posthog: PostHog): void {
	instance = posthog;
	for (const callback of queue.splice(0)) {
		callback(posthog);
	}
}
