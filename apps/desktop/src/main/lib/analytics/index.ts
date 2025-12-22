import { env } from "main/env.main";
import { apiClient } from "main/lib/api-client";
import { PostHog } from "posthog-node";

let client: PostHog | null = null;
let cachedUserId: string | null = null;

function getClient(): PostHog | null {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		return null;
	}

	if (!client) {
		client = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			flushAt: 1, // Send events immediately for desktop app
			flushInterval: 0,
		});
	}
	return client;
}

async function getUserId(): Promise<string | null> {
	if (cachedUserId) return cachedUserId;
	try {
		const user = await apiClient.user.me.query();
		cachedUserId = user?.id ?? null;
		return cachedUserId;
	} catch {
		return null;
	}
}

/**
 * Clear cached user ID (call on sign out)
 */
export function clearUserCache(): void {
	cachedUserId = null;
}

/**
 * Track an event with the current user's ID as distinct_id.
 * Fire-and-forget - errors are silently ignored.
 */
export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	const posthog = getClient();
	if (!posthog) return;

	getUserId()
		.then((userId) => {
			if (!userId) return;
			posthog.capture({
				distinctId: userId,
				event,
				properties: {
					...properties,
					app_name: "desktop",
					platform: process.platform,
				},
			});
		})
		.catch(() => {});
}

/**
 * Shutdown PostHog client (call on app quit)
 */
export async function shutdown(): Promise<void> {
	await client?.shutdown();
}
