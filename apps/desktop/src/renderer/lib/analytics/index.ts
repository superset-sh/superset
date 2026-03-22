import { posthog } from "renderer/lib/posthog";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
}
