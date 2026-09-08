import { createHash } from "node:crypto";

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
	/**
	 * A Stripe id that is stable across webhook retries — the event id where we
	 * have one, otherwise the subscription id. See `idempotencyUuid`.
	 */
	idempotencyKey: string;
	/** When Stripe says it happened, not when we got around to processing it. */
	occurredAt: Date;
	properties?: Record<string, unknown>;
};

/**
 * PostHog de-duplicates on (uuid, event name, timestamp, distinct_id), so a
 * retried Stripe webhook only collapses if all four are stable — which is why
 * callers pass `occurredAt` rather than letting it default to now().
 *
 * Stripe ids are not UUIDs and the column is, so the id is hashed into the
 * UUID shape. Same input, same uuid, on every retry.
 */
function idempotencyUuid(event: BillingEvent, key: string): string {
	const hex = createHash("sha256").update(`${event}:${key}`).digest("hex");
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20, 32),
	].join("-");
}

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
 * Safe to run twice: Stripe retries a webhook whenever the handler fails or
 * times out, and this one does enough before reaching here (emails, QStash) to
 * make that a real possibility rather than a theoretical one. Without the
 * de-duplication below, a retry would bill `payment_succeeded` twice.
 *
 * Never throws: a webhook must not fail because analytics did.
 */
export async function captureBillingEvent({
	event,
	organizationId,
	initiatedByUserId,
	idempotencyKey,
	occurredAt,
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
			uuid: idempotencyUuid(event, idempotencyKey),
			timestamp: occurredAt,
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
