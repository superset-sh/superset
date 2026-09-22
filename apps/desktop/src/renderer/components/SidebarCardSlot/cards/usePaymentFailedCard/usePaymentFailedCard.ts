import { formatPrice } from "@superset/i18n/format";
import { isPaymentFailingStatus } from "@superset/shared/billing";
import { useNavigate } from "@tanstack/react-router";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { SidebarCardEntry } from "../../types";

/**
 * Two states, because a failed charge is otherwise invisible in-app.
 *
 * `past_due` — Stripe is still retrying and access continues, so the card
 * warns while paying the invoice still saves the subscription.
 *
 * `lapsed` — Stripe gave up, cancelled, and the organization dropped to free.
 * Keying only on `past_due` meant the card vanished at exactly that moment:
 * every one of the 87 organizations this happened to recorded zero
 * `payment_failed_banner_shown`. They were never told, they just quietly lost
 * their triggers. Paying the old invoice cannot undo it either — Stripe will
 * not reactivate a cancelled subscription — so this state sends people to
 * Billing to resubscribe instead of to the invoice.
 *
 * Neither state gets an `onDismiss`.
 */
export function usePaymentFailedCard({
	surface,
}: {
	surface: "v1" | "v2";
}): SidebarCardEntry | null {
	const { data: session } = authClient.useSession();
	const { data: activePlan } = cloudTrpc.billing.activePlan.useQuery(undefined);
	const isFailing = isPaymentFailingStatus(activePlan?.status);
	// `lapsed` is decided server-side from rows activePlan already reads, so
	// the two queries below stay off for everyone still paying and for
	// everyone who never paid. Gating them on `plan === "free"` instead would
	// put a Stripe round-trip on every app load for every past customer.
	const mayHaveLapsed = activePlan?.lapsed === true;
	const isRelevant = isFailing || mayHaveLapsed;
	// Ownership is judged against the org being billed, which is the org THIS
	// window shows. The session's active organization is shared by every
	// window, so its membership could belong to whatever org another window
	// last switched to. This list is scoped server-side by the window's org header.
	const { data: members } = cloudTrpc.organization.listMembers.useQuery(
		{ includeDeactivated: false },
		{ enabled: isRelevant },
	);
	// The amount is the whole point of the card: "a payment failed" without it
	// sends people hunting for a number the app never shows them.
	const { data: outstandingInvoice } =
		cloudTrpc.billing.outstandingInvoice.useQuery(undefined, {
			enabled: isRelevant,
		});
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const navigate = useNavigate();

	const hasLapsed = mayHaveLapsed && Boolean(outstandingInvoice);

	if (!isFailing && !hasLapsed) return null;

	const isOwner =
		members?.find((m) => m.userId === session?.user?.id)?.role === "owner";

	const amount = outstandingInvoice
		? formatPrice(outstandingInvoice.amountDue, outstandingInvoice.currency)
		: null;
	const hostedInvoiceUrl = outstandingInvoice?.hostedInvoiceUrl ?? null;
	const state = hasLapsed ? "lapsed" : "past_due";

	// Lapsed: the subscription is gone and paying the old invoice will not
	// bring it back, so the only honest action is starting a new one.
	if (hasLapsed) {
		return {
			id: "payment-failed",
			badge: "Action needed",
			title: amount ? `Pro ended — ${amount} unpaid` : "Pro ended",
			// The title already carries the amount, so the body does not repeat it.
			// Stated as two facts rather than one cause. A voluntary cancellation
			// can also leave its closing invoice unpaid, and telling someone who
			// chose to leave that a failed charge is why they lost Pro would be
			// the same wrong-reason bug this card exists to stop.
			description: isOwner
				? "This organization is on the free plan and its triggers have stopped running. Restart Pro to turn them back on."
				: "This organization is on the free plan and its triggers have stopped running. Ask an owner to restart Pro.",
			actionLabel: isOwner ? "Restart Pro" : undefined,
			onAction: isOwner
				? () => {
						track("payment_failed_banner_clicked", { surface, state });
						navigate({ to: "/settings/billing" });
					}
				: undefined,
			className: "border-warning/50",
			onShown: () =>
				track("payment_failed_banner_shown", { surface, isOwner, state }),
		};
	}

	// Non-owners are rejected by requireBillingOwner at the portal, so they get
	// the warning without an action that would dead-end.
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
					track("payment_failed_banner_clicked", { surface, state });
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
		onShown: () =>
			track("payment_failed_banner_shown", { surface, isOwner, state }),
	};
}
