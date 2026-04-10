import { isPostHogEnabled, posthog } from "renderer/lib/posthog";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!isPostHogEnabled()) return;
	posthog.capture(event, properties);
}
