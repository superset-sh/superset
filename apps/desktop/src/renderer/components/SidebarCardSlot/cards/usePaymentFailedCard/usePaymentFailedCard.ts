import { isPaymentFailingStatus } from "@superset/shared/billing";
import { useNavigate } from "@tanstack/react-router";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { SidebarCardEntry } from "../../types";

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
	const navigate = useNavigate();

	if (!isFailing) return null;

	// Non-owners are rejected by requireBillingOwner at the portal, so they get
	// the warning without an action that would dead-end.
	const isOwner =
		members?.find((m) => m.userId === session?.user?.id)?.role === "owner";

	return {
		id: "payment-failed",
		badge: "Action needed",
		title: "Payment failed",
		description: isOwner
			? "We couldn't charge your payment method. Update it to keep your plan."
			: "We couldn't charge this organization's payment method. Ask an owner to update it.",
		actionLabel: isOwner ? "Update payment method" : undefined,
		onAction: isOwner
			? () => {
					track("payment_failed_banner_clicked", { surface });
					navigate({ to: "/settings/billing" });
				}
			: undefined,
		className: "border-amber-500/50",
		onShown: () => track("payment_failed_banner_shown", { surface, isOwner }),
	};
}
