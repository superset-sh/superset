import { app } from "electron";
import { env } from "main/env.main";
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

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!userId) return;
	if (!isTelemetryEnabled()) return;

	const client = getClient();
	if (!client) return;

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
