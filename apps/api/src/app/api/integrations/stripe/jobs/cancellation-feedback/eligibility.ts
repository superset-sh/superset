import type Stripe from "stripe";

type CancellationState = Pick<
	Stripe.Subscription,
	| "status"
	| "cancel_at_period_end"
	| "cancel_at"
	| "canceled_at"
	| "cancellation_details"
>;

export function isFeedbackEligible(
	subscription: CancellationState,
	canceledAt: number,
) {
	return (
		subscription.canceled_at === canceledAt &&
		subscription.cancellation_details?.reason === "cancellation_requested" &&
		!subscription.cancellation_details.comment?.trim() &&
		(subscription.status === "canceled" ||
			(subscription.status === "active" &&
				(subscription.cancel_at_period_end || subscription.cancel_at !== null)))
	);
}

export async function emitFeedbackOnce({
	claim,
	emit,
}: {
	claim: () => Promise<unknown>;
	emit: () => Promise<void>;
}) {
	if (!(await claim())) return false;
	// Resend events have no idempotency key. Keep the claim even if a send
	// times out: retrying an accepted event would start a second email run.
	await emit();
	return true;
}
