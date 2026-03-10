import { PostHog } from "posthog-node";

let client: PostHog | null = null;

function getClient(): PostHog | null {
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key) return null;

	if (!client) {
		client = new PostHog(key, {
			host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
			flushAt: 1,
			flushInterval: 0,
		});
	}
	return client;
}

export function track(
	distinctId: string,
	event: string,
	properties?: Record<string, unknown>,
): void {
	const posthog = getClient();
	if (!posthog) return;

	try {
		posthog.capture({
			distinctId,
			event,
			properties: {
				...properties,
				app_name: "api",
			},
		});
	} catch (err) {
		console.warn("[analytics] PostHog capture failed", err);
	}
}
