import { PostHog } from "posthog-node";
import { env } from "../env";

let client: PostHog | null = null;

function getClient(): PostHog | null {
	if (client) return client;
	if (!env.NEXT_PUBLIC_POSTHOG_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST) {
		return null;
	}
	client = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
		host: env.NEXT_PUBLIC_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0,
	});
	return client;
}

export type ReferralEvent =
	| {
			name: "referral_signup_attributed";
			distinctId: string;
			properties: {
				referee_user_id: string;
				referrer_organization_id: string;
			};
	  }
	| {
			name: "referral_rejected";
			distinctId: string;
			properties: {
				referee_user_id: string;
				reason: string;
			};
	  }
	| {
			name: "referral_checkout_trialed";
			distinctId: string;
			properties: {
				referee_user_id: string;
				referral_id: string;
				referrer_organization_id: string;
			};
	  }
	| {
			name: "referral_rewarded";
			distinctId: string;
			properties: {
				referrer_organization_id: string;
				referee_user_id: string;
				amount_cents: number;
				stripe_customer_id: string;
			};
	  };

export function captureReferralEvent(event: ReferralEvent) {
	const posthog = getClient();
	if (!posthog) return;
	try {
		posthog.capture({
			distinctId: event.distinctId,
			event: event.name,
			properties: event.properties,
		});
	} catch (error) {
		console.error("[referral/analytics] capture failed:", error);
	}
}
