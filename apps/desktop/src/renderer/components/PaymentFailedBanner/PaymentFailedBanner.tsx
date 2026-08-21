import { isPaymentFailingStatus } from "@superset/shared/billing";
import { SidebarCard } from "@superset/ui/sidebar-card";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface PaymentFailedBannerProps {
	surface: "v1" | "v2";
	isCollapsed?: boolean;
}

/**
 * Stripe keeps retrying for ~14 days before canceling, and access continues for
 * that whole window, so a failed charge is otherwise invisible in-app until the
 * plan abruptly disappears. Not dismissible for that reason.
 */
export function PaymentFailedBanner({
	surface,
	isCollapsed,
}: PaymentFailedBannerProps) {
	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: activePlan } = cloudTrpc.billing.activePlan.useQuery(undefined);
	const navigate = useNavigate();

	const isOwner =
		activeOrg?.members?.find((m) => m.userId === session?.user?.id)?.role ===
		"owner";
	const isPaymentFailing = isPaymentFailingStatus(activePlan?.status);
	const isVisible = !isCollapsed && isPaymentFailing;

	useEffect(() => {
		if (!isVisible) return;
		track("payment_failed_banner_shown", { surface, isOwner });
	}, [isVisible, surface, isOwner]);

	function handleUpdatePayment() {
		track("payment_failed_banner_clicked", { surface });
		navigate({ to: "/settings/billing" });
	}

	if (!isVisible) return null;

	return (
		<AnimatePresence>
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: 8 }}
				transition={{ duration: 0.2 }}
				className="px-3 pb-2"
			>
				<SidebarCard
					badge="Action needed"
					title="Payment failed"
					description={
						isOwner
							? "We couldn't charge your payment method. Update it to keep your plan."
							: "We couldn't charge this organization's payment method. Ask an owner to update it."
					}
					actionLabel={isOwner ? "Update payment method" : undefined}
					onAction={isOwner ? handleUpdatePayment : undefined}
					className="border-amber-500/50"
				/>
			</motion.div>
		</AnimatePresence>
	);
}
