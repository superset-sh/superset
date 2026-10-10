import type Stripe from "stripe";

function toDate(seconds: number | null | undefined): Date | null {
	return seconds ? new Date(seconds * 1000) : null;
}

export function seatItem(
	stripeSubscription: Stripe.Subscription,
): Stripe.SubscriptionItem | undefined {
	const items = stripeSubscription.items.data;
	return (
		items.find((item) => item.price?.recurring?.usage_type !== "metered") ??
		items[0]
	);
}

export function subscriptionRowFromStripe(
	stripeSubscription: Stripe.Subscription,
) {
	const item = seatItem(stripeSubscription);
	const hasTrial =
		stripeSubscription.trial_start && stripeSubscription.trial_end;
	return {
		status: stripeSubscription.status,
		stripeCustomerId:
			typeof stripeSubscription.customer === "string"
				? stripeSubscription.customer
				: stripeSubscription.customer.id,
		stripeSubscriptionId: stripeSubscription.id,
		periodStart: toDate(item?.current_period_start),
		periodEnd: toDate(item?.current_period_end),
		cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
		cancelAt: toDate(stripeSubscription.cancel_at),
		canceledAt: toDate(stripeSubscription.canceled_at),
		endedAt: toDate(stripeSubscription.ended_at),
		seats: item?.quantity ?? null,
		billingInterval: item?.price.recurring?.interval ?? null,
		stripeScheduleId: stripeSubscription.schedule
			? typeof stripeSubscription.schedule === "string"
				? stripeSubscription.schedule
				: stripeSubscription.schedule.id
			: null,
		...(hasTrial
			? {
					trialStart: toDate(stripeSubscription.trial_start),
					trialEnd: toDate(stripeSubscription.trial_end),
				}
			: {}),
	};
}

export interface PreviousSubscriptionState {
	status: string;
	cancelAtPeriodEnd: boolean | null;
	cancelAt: Date | null;
}

function isLive(status: string): boolean {
	return status === "active" || status === "trialing";
}

export function subscriptionTransitions(
	previous: PreviousSubscriptionState | undefined,
	next: Stripe.Subscription,
): { started: boolean; canceled: boolean } {
	const previouslyCanceling = !!(
		previous?.cancelAtPeriodEnd || previous?.cancelAt
	);
	return {
		started: isLive(next.status) && !(previous && isLive(previous.status)),
		canceled:
			next.status === "active" &&
			!!(next.cancel_at_period_end || next.cancel_at) &&
			!previouslyCanceling,
	};
}
