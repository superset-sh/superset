import { PostHog } from "posthog-node";

import { env } from "../env";

export const ACTIVATION_CAMPAIGN_FLAG = "activation-email-campaign";

const posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
	host: env.NEXT_PUBLIC_POSTHOG_HOST,
	flushAt: 1,
	flushInterval: 0,
	// This is awaited inside the signup hook, and the SDK default is 10s — long
	// enough that a slow PostHog would stall signup rather than fail open.
	requestTimeout: 3000,
});

/**
 * Arm for the activation-drip A/B. `getFeatureFlag` emits the
 * `$feature_flag_called` exposure PostHog scores the experiment on, so a user
 * enters the analysis only when this call succeeds.
 *
 * The flag must be MULTIVARIATE with variants keyed exactly `control` and
 * `test`. Only `control` withholds the drip; a missing, disabled or boolean
 * flag reads as `test`, so shipping this before the flag exists changes
 * nothing — everyone keeps getting the campaign until someone creates the
 * flag at 50/50.
 *
 * Fails OPEN for the same reason: the drip is what ships to everyone today, so
 * a PostHog outage must not silently stop it. Those signups emit no exposure
 * either, which keeps them out of both arms instead of polluting control.
 */
export async function getActivationVariant(
	userId: string,
): Promise<"control" | "test"> {
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
