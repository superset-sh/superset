import type Stripe from "stripe";

// --- Helpers ---

export function formatPrice(cents: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);
}

export interface DiscountInfo {
	name: string;
	percentOff: number | null;
	amountOff: number | null;
}

export function getDiscountInfo(
	stripeSub: Stripe.Subscription,
): DiscountInfo | null {
	const discount = stripeSub.discounts?.[0];
	if (!discount || typeof discount === "string") return null;

	const coupon = discount.source?.coupon;
	if (!coupon || typeof coupon === "string") return null;

	return {
		name: coupon.name ?? coupon.id,
		percentOff: coupon.percent_off,
		amountOff: coupon.amount_off,
	};
}

export function applyDiscount(
	totalCents: number,
	discount: DiscountInfo | null,
): number {
	if (!discount) return totalCents;
	if (discount.percentOff) {
		return Math.round(totalCents * (1 - discount.percentOff / 100));
	}
	if (discount.amountOff) {
		return Math.max(0, totalCents - discount.amountOff);
	}
	return totalCents;
}

function stripeDashboardButtons(
	customerId: string,
	subscriptionId?: string,
): unknown {
	const elements: {
		type: string;
		text: { type: string; text: string };
		url: string;
	}[] = [
		{
			type: "button",
			text: { type: "plain_text", text: "View Customer" },
			url: `https://dashboard.stripe.com/customers/${customerId}`,
		},
	];

	if (subscriptionId) {
		elements.push({
			type: "button",
			text: { type: "plain_text", text: "View Subscription" },
			url: `https://dashboard.stripe.com/subscriptions/${subscriptionId}`,
		});
	}

	return { type: "actions", elements };
}

// --- Enriched data passed to formatters ---

export interface EnrichedSubscription {
	organizationName: string;
	planName: string;
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	seatCount: number;
	pricePerSeatCents: number;
	currency: string;
	interval: "monthly" | "yearly";
	discount: DiscountInfo | null;
	accessEndsAt: Date | null;
}

// --- Shared field builders ---

const intervalLabel = (interval: "monthly" | "yearly") =>
	interval === "yearly" ? "yr" : "mo";

function priceField(enriched: EnrichedSubscription): string {
	return `*Price:*\n${formatPrice(enriched.pricePerSeatCents)}/seat/${intervalLabel(enriched.interval)}`;
}

function discountField(enriched: EnrichedSubscription): string {
	if (!enriched.discount) return "*Discount:*\nNone";
	const desc = enriched.discount.percentOff
		? `${enriched.discount.percentOff}% off`
		: `${formatPrice(enriched.discount.amountOff ?? 0)} off`;
	return `*Discount:*\n${enriched.discount.name} (${desc})`;
}

function totalField(enriched: EnrichedSubscription): string {
	const subtotal = enriched.pricePerSeatCents * enriched.seatCount;
	const total = applyDiscount(subtotal, enriched.discount);
	const suffix = intervalLabel(enriched.interval);
	if (enriched.discount && total !== subtotal) {
		return `*Total:*\n${formatPrice(total)}/${suffix} (was ${formatPrice(subtotal)}/${suffix})`;
	}
	return `*Total:*\n${formatPrice(total)}/${suffix}`;
}

/**
 * Consistent 2-column field grid used by every event formatter.
 * Row 1: Organization | Plan
 * Row 2: Billing      | Seats
 * Row 3: Price        | Discount
 * Row 4: Total
 */
function standardFields(enriched: EnrichedSubscription): unknown {
	return {
		type: "section",
		fields: [
			{ type: "mrkdwn", text: `*Organization:*\n${enriched.organizationName}` },
			{ type: "mrkdwn", text: `*Plan:*\n${enriched.planName}` },
			{ type: "mrkdwn", text: `*Billing:*\n${enriched.interval}` },
			{ type: "mrkdwn", text: `*Seats:*\n${enriched.seatCount}` },
			{ type: "mrkdwn", text: priceField(enriched) },
			{ type: "mrkdwn", text: discountField(enriched) },
			{ type: "mrkdwn", text: totalField(enriched) },
		],
	};
}

// --- Formatters ---

export function formatSubscriptionStarted(
	enriched: EnrichedSubscription,
): unknown[] {
	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "New Subscription Started",
				emoji: true,
			},
		},
		standardFields(enriched),
		stripeDashboardButtons(
			enriched.stripeCustomerId,
			enriched.stripeSubscriptionId,
		),
	];
}

export function formatSubscriptionCancelled(
	enriched: EnrichedSubscription,
): unknown[] {
	const endsAtStr = enriched.accessEndsAt
		? enriched.accessEndsAt.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: "N/A";
	return [
		{
			type: "header",
			text: { type: "plain_text", text: "Subscription Cancelled", emoji: true },
		},
		standardFields(enriched),
		{
			type: "section",
			text: { type: "mrkdwn", text: `*Access ends:*\n${endsAtStr}` },
		},
		stripeDashboardButtons(
			enriched.stripeCustomerId,
			enriched.stripeSubscriptionId,
		),
	];
}

export function formatSeatAdded(
	enriched: EnrichedSubscription,
	memberName: string,
	previousSeats: number,
	newSeats: number,
): unknown[] {
	return [
		{
			type: "header",
			text: { type: "plain_text", text: "Seat Added", emoji: true },
		},
		standardFields(enriched),
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Member:*\n${memberName}` },
				{ type: "mrkdwn", text: `*Seats:*\n${previousSeats} -> ${newSeats}` },
			],
		},
		stripeDashboardButtons(
			enriched.stripeCustomerId,
			enriched.stripeSubscriptionId,
		),
	];
}

export function formatSeatRemoved(
	enriched: EnrichedSubscription,
	memberName: string,
	previousSeats: number,
	newSeats: number,
): unknown[] {
	return [
		{
			type: "header",
			text: { type: "plain_text", text: "Seat Removed", emoji: true },
		},
		standardFields(enriched),
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Member:*\n${memberName}` },
				{ type: "mrkdwn", text: `*Seats:*\n${previousSeats} -> ${newSeats}` },
			],
		},
		stripeDashboardButtons(
			enriched.stripeCustomerId,
			enriched.stripeSubscriptionId,
		),
	];
}

export function formatPaymentFailed(
	enriched: EnrichedSubscription,
	amountCents: number,
): unknown[] {
	return [
		{
			type: "header",
			text: { type: "plain_text", text: "Payment Failed", emoji: true },
		},
		standardFields(enriched),
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Amount due:*\n${formatPrice(amountCents)}`,
			},
		},
		stripeDashboardButtons(
			enriched.stripeCustomerId,
			enriched.stripeSubscriptionId,
		),
	];
}

export function formatPaymentSucceeded(
	enriched: EnrichedSubscription,
	amountCents: number,
	periodStart: number,
	periodEnd: number,
): unknown[] {
	const startStr = new Date(periodStart * 1000).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	const endStr = new Date(periodEnd * 1000).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	return [
		{
			type: "header",
			text: { type: "plain_text", text: "Payment Succeeded", emoji: true },
		},
		standardFields(enriched),
		{
			type: "section",
			fields: [
				{ type: "mrkdwn", text: `*Amount paid:*\n${formatPrice(amountCents)}` },
				{ type: "mrkdwn", text: `*Period:*\n${startStr} - ${endStr}` },
			],
		},
		stripeDashboardButtons(
			enriched.stripeCustomerId,
			enriched.stripeSubscriptionId,
		),
	];
}

export function formatPlanChanged(
	enriched: EnrichedSubscription,
	previousInterval?: string,
): unknown[] {
	return [
		{
			type: "header",
			text: { type: "plain_text", text: "Plan Changed", emoji: true },
		},
		standardFields(enriched),
		...(previousInterval
			? [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `*Interval:*\n${previousInterval} -> ${enriched.interval}`,
						},
					},
				]
			: []),
		stripeDashboardButtons(
			enriched.stripeCustomerId,
			enriched.stripeSubscriptionId,
		),
	];
}
