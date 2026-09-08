import { getOrganizationOwners } from "../utils";
import { posthog } from "./analytics";

type BillingEvent =
	| "subscription_started"
	| "checkout_abandoned"
	| "payment_succeeded"
	| "payment_failed";

type CaptureArgs = {
	event: BillingEvent;
	organizationId: string;
	/**
	 * `metadata.userId` off the Stripe object. Better Auth stamps it on both the
	 * checkout session and the subscription it creates.
	 */
	initiatedByUserId?: string | null;
	properties?: Record<string, unknown>;
};

/**
 * Attributes a Stripe outcome to the user who started it, so it lands on the
 * same PostHog person timeline as `paywall_opened` and can be a funnel step.
 * The desktop app identifies with the Better Auth user id, and Better Auth
 * stamps that same id into Stripe metadata — so no id mapping is needed.
 *
 * Organizations subscribed outside the app (a Stripe-side action, an enterprise
 * deal closed by hand) carry no initiator. The owner is the closest honest
 * answer there, and `attribution` records which one we used so a funnel built on
 * these events can tell measured conversions from inferred ones.
 *
 * Never throws: a webhook must not fail because analytics did.
 */
export async function captureBillingEvent({
	event,
	organizationId,
	initiatedByUserId,
	properties,
}: CaptureArgs): Promise<void> {
	try {
		let distinctId = initiatedByUserId ?? null;
		let attribution: "initiator" | "owner" = "initiator";

		if (!distinctId) {
			const [owner] = await getOrganizationOwners(organizationId);
			distinctId = owner?.id ?? null;
			attribution = "owner";
		}

		// Falling back to the organization id would mint a phantom person and
		// silently inflate every funnel built on these events. Dropping is the
		// lesser harm, and the warning is what makes it visible.
		if (!distinctId) {
			console.warn(
				`[billing-analytics] No user to attribute ${event} to for organization ${organizationId}`,
			);
			return;
		}

		posthog.capture({
			distinctId,
			event,
			properties: {
				...(properties ?? {}),
				organization_id: organizationId,
				attribution,
			},
			groups: { organization: organizationId },
		});

		await posthog.flush();
	} catch (error) {
		console.error(`[billing-analytics] Failed to capture ${event}:`, error);
	}
}
