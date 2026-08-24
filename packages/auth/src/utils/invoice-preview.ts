import type Stripe from "stripe";
import { stripeClient } from "../stripe";
import { formatPrice } from "./billing";

export interface NextInvoicePreview {
	prorationAmount: string;
	nextInvoiceTotal: string;
}

function isProrationLine(line: Stripe.InvoiceLineItem): boolean {
	return Boolean(
		line.parent?.subscription_item_details?.proration ||
			line.parent?.invoice_item_details?.proration,
	);
}

/**
 * What the next invoice actually comes to after a seat change: the new base
 * plus the proration Stripe has already queued for the rest of the cycle.
 *
 * Returns null when Stripe cannot give a figure. Callers must then fall back
 * to copy that quotes no number — a seat-change email that states a total the
 * customer will not be charged is how a card limit gets set too low.
 */
export async function previewNextInvoice(
	customerId: string,
	subscriptionId: string,
): Promise<NextInvoicePreview | null> {
	try {
		const preview = await stripeClient.invoices.createPreview({
			customer: customerId,
			subscription: subscriptionId,
		});

		const prorationCents = preview.lines.data
			.filter(isProrationLine)
			.reduce((total, line) => total + line.amount, 0);

		return {
			prorationAmount: formatPrice(prorationCents, preview.currency),
			nextInvoiceTotal: formatPrice(preview.total, preview.currency),
		};
	} catch (error) {
		console.error("[billing/invoice-preview] Preview failed:", error);
		return null;
	}
}
