import { getOutlit } from "renderer/lib/outlit";
import { posthog } from "renderer/lib/posthog";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
	getOutlit()?.track(
		event,
		properties as Record<string, string | number | boolean | null> | undefined,
	);
}
