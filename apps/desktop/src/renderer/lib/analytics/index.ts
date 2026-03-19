import { outlit } from "renderer/lib/outlit";
import { posthog } from "renderer/lib/posthog";
import { toOutlitProperties } from "shared/analytics";

let telemetryEnabled = false;

export function setTelemetryEnabled(enabled: boolean): void {
	telemetryEnabled = enabled;
}

export function isTelemetryEnabled(): boolean {
	return telemetryEnabled;
}

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!telemetryEnabled) return;
	posthog.capture(event, properties);
	outlit.track(event, toOutlitProperties(properties));
}
