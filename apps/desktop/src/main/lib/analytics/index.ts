import { app } from "electron";
import { env } from "main/env.main";
import { getOutlit } from "main/lib/outlit";
import { PostHog } from "posthog-node";
import { DEFAULT_TELEMETRY_ENABLED } from "shared/constants";

export let posthog: PostHog | null = null;
let userId: string | null = null;

function getClient(): PostHog | null {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		return null;
	}

	if (!posthog) {
		posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
		});
	}
	return posthog;
}

function isTelemetryEnabled(): boolean {
	return DEFAULT_TELEMETRY_ENABLED;
}

export function setUserId(id: string | null): void {
	userId = id;
}

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
	if (!userId) return;
	if (!isTelemetryEnabled()) return;

	const client = getClient();
	if (client) {
		client.capture({
			distinctId: userId,
			event,
			properties: {
				...properties,
				app_name: "desktop",
				platform: process.platform,
				desktop_version: app.getVersion(),
			},
		});
	}

	// Outlit tracking
	try {
		const outlit = getOutlit();
		if (outlit) {
			outlit.track({
				eventName: event,
				userId,
				properties: toOutlitProperties(properties),
			});

			// Fire user.activate() on project_opened (activation moment)
			if (event === "project_opened") {
				outlit.user.activate({ userId });
			}
		}
	} catch (error) {
		console.error("[analytics/outlit] Failed to track:", error);
	}
}
