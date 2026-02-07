import posthog from "posthog-js";

import { getOutlit } from "@/lib/outlit";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
	getOutlit()?.track(
		event,
		properties as
			| Record<string, string | number | boolean | null>
			| undefined,
	);
}
