import type Stripe from "stripe";
import { stripeClient } from "../stripe";
import { formatPrice } from "./billing";

export interface NextInvoicePreview {
	prorationAmount: string;
	nextInvoiceTotal: string;
}

function prorationForItem(
	line: Stripe.InvoiceLineItem,
	subscriptionItemId: string,
): boolean {
	const details = line.parent?.subscription_item_details;
	return Boolean(
		details?.proration && details.subscription_item === subscriptionItemId,
	);
}

/**
 * What the next invoice actually comes to after a seat change: the new base
 * plus the proration Stripe has already queued for the rest of the cycle.
 *
 * Returns null when Stripe cannot give a figure, or when the numbers would not
 * add up — callers must then fall back to copy that quotes no number. A
 * seat-change email stating a total the customer will not be charged is how a
 * card limit gets set too low, which is the whole reason this exists.
 */
export async function previewNextInvoice(
	customerId: string,
	subscriptionId: string,
	subscriptionItemId: string,
	expectedSign: "charge" | "credit",
): Promise<NextInvoicePreview | null> {
	try {
		const preview = await stripeClient.invoices.createPreview({
			customer: customerId,
			subscription: subscriptionId,
		});

		// `preview.lines` is paginated, so a long invoice would silently
		// under-count and make the quoted figures disagree with the total.
		if (preview.lines.has_more) return null;

		// Only this seat change: an unrelated proration still on the upcoming
		// invoice (a plan switch, an earlier seat move) is not what we changed.
		const prorationCents = preview.lines.data
			.filter((line) => prorationForItem(line, subscriptionItemId))
			.reduce((total, line) => total + line.amount, 0);

		if (prorationCents === 0) return null;
		// A removal that nets to a charge is not "a credit for unused time".
		if (expectedSign === "charge" && prorationCents < 0) return null;
		if (expectedSign === "credit" && prorationCents > 0) return null;

		return {
			prorationAmount: formatPrice(Math.abs(prorationCents), preview.currency),
			nextInvoiceTotal: formatPrice(preview.total, preview.currency),
		};
	} catch (error) {
		console.error("[billing/invoice-preview] Preview failed:", error);
		return null;
	}
}
