import posthog from "posthog-js";

import { getOutlit } from "@/lib/outlit";

function toOutlitProperties(
	properties?: Record<string, unknown>,
): Record<string, string | number | boolean | null> | undefined {
	if (!properties) return undefined;
	const result: Record<string, string | number | boolean | null> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (
			value === null ||
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			result[key] = value;
		}
	}
	return result;
}

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
	getOutlit().track(event, toOutlitProperties(properties));
}
