import posthog from "posthog-js";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
}
