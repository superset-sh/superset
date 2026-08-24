import { isPaymentFailingStatus } from "@superset/shared/billing";
import { useNavigate } from "@tanstack/react-router";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { SidebarCardEntry } from "../../types";

function formatAmount(amount: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount / 100);
}

/**
 * Stripe keeps retrying for ~14 days before canceling, and access continues
 * for that whole window, so a failed charge is otherwise invisible in-app
 * until the plan abruptly disappears. Returns no `onDismiss` for that reason.
 */
export function usePaymentFailedCard({
	surface,
}: {
	surface: "v1" | "v2";
}): SidebarCardEntry | null {
	const { data: session } = authClient.useSession();
	const { data: activePlan } = cloudTrpc.billing.activePlan.useQuery(undefined);
	const isFailing = isPaymentFailingStatus(activePlan?.status);
	// Ownership is judged against the org being billed, which is the org THIS
	// window shows. The session's active organization is shared by every
	// window, so its membership could belong to whatever org another window
	// last switched to. This list is scoped server-side by the window's org header.
	const { data: members } = cloudTrpc.organization.listMembers.useQuery(
		{ includeDeactivated: false },
		{ enabled: isFailing },
	);
	// The amount is the whole point of the card: "a payment failed" without it
	// sends people hunting for a number the app never shows them.
	const { data: outstandingInvoice } =
		cloudTrpc.billing.outstandingInvoice.useQuery(undefined, {
			enabled: isFailing,
		});
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const navigate = useNavigate();

	if (!isFailing) return null;

	// Non-owners are rejected by requireBillingOwner at the portal, so they get
	// the warning without an action that would dead-end.
	const isOwner =
		members?.find((m) => m.userId === session?.user?.id)?.role === "owner";

	const amount = outstandingInvoice
		? formatAmount(outstandingInvoice.amountDue, outstandingInvoice.currency)
		: null;
	const hostedInvoiceUrl = outstandingInvoice?.hostedInvoiceUrl ?? null;

	const ownerDescription = amount
		? `We couldn't charge ${amount}. Update your payment method to keep your plan.`
		: "We couldn't charge your payment method. Update it to keep your plan.";
	const memberDescription = amount
		? `We couldn't charge this organization's payment method for ${amount}. Ask an owner to update it.`
		: "We couldn't charge this organization's payment method. Ask an owner to update it.";

	return {
		id: "payment-failed",
		badge: "Action needed",
		title: amount ? `Payment failed — ${amount} due` : "Payment failed",
		description: isOwner ? ownerDescription : memberDescription,
		actionLabel: isOwner
			? hostedInvoiceUrl
				? "Pay now"
				: "Update payment method"
			: undefined,
		onAction: isOwner
			? () => {
					track("payment_failed_banner_clicked", { surface });
					// Straight to the invoice when we have one — the billing portal
					// is several clicks from the same place.
					if (hostedInvoiceUrl) {
						openUrl.mutate(hostedInvoiceUrl);
						return;
					}
					navigate({ to: "/settings/billing" });
				}
			: undefined,
		className: "border-warning/50",
		onShown: () => track("payment_failed_banner_shown", { surface, isOwner }),
	};
}
