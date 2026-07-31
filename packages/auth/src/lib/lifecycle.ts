import { PostHog } from "posthog-node";

import { env } from "../env";

export const ACTIVATION_CAMPAIGN_FLAG = "activation-email-campaign";

const posthog = env.NEXT_PUBLIC_POSTHOG_KEY
	? new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
		})
	: null;

export async function getActivationVariant(
	userId: string,
): Promise<"control" | "test"> {
	if (!posthog) return "test";
	try {
		const variant = await posthog.getFeatureFlag(
			ACTIVATION_CAMPAIGN_FLAG,
			userId,
		);
		await posthog.flush();
		return variant === "control" ? "control" : "test";
	} catch (error) {
		console.error("[lifecycle] Failed to evaluate activation flag:", error);
		return "test";
	}
}

export async function emitLifecycleEvent(
	name: string,
	email: string,
	payload?: Record<string, string>,
) {
	const response = await fetch("https://api.resend.com/events/send", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ name, email, payload }),
	});
	if (!response.ok) {
		throw new Error(
			`Resend event ${name} failed: ${response.status} ${await response.text()}`,
		);
	}
}
