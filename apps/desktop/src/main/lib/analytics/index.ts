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

export function getPosthogClient(): PostHog | null {
	return getClient();
}

export function getUserId(): string | null {
	return userId;
}

function isTelemetryEnabled(): boolean {
	return DEFAULT_TELEMETRY_ENABLED;
}

export function setUserId(id: string | null): void {
	userId = id;
}

/**
 * Drain captures onto the wire before process exit. `flushAt: 1` starts the
 * HTTP send at capture time, but `app.exit()` right after a quit-time capture
 * kills the request mid-flight; awaiting this (time-bounded) closes that race.
 * The client is unusable afterwards, so only call it from the quit path.
 */
export async function flushAnalytics(timeoutMs = 2_000): Promise<void> {
	if (!posthog) return;
	try {
		await Promise.race([
			posthog.shutdown(timeoutMs),
			new Promise<void>((resolve) => {
				setTimeout(resolve, timeoutMs).unref?.();
			}),
		]);
	} catch {
		// Losing a final telemetry event must never block quit.
	}
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
}
