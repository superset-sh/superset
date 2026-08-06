import { SidebarCard } from "@superset/ui/sidebar-card";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { useV2AvailableBannerStore } from "renderer/stores/v2-available-banner";

/**
 * Surfaced in the LEGACY (v1) sidebar whenever v2 is not active.
 *
 * Two distinct cases:
 *  - A pre-cutoff user who never opted in (or whose localStorage opt-in was
 *    lost — see #5498): v2 is available but off. The card explains they are
 *    on the legacy dashboard and how to switch back, and is dismissible.
 *  - A v2-only user who explicitly opted out: v2 is *not* available to
 *    return to in Settings → Experimental, so the card is dismissed-free
 *    (it simply states the legacy view).
 */
export function V2AvailableBanner() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const dismissed = useV2AvailableBannerStore((s) => s.dismissed);
	const dismiss = useV2AvailableBannerStore((s) => s.dismiss);
	const navigate = useNavigate();

	function handleManage() {
		track("v2_banner_manage_clicked");
		navigate({ to: "/settings/experimental" });
	}

	function handleDismiss() {
		track("v2_banner_dismissed");
		dismiss();
	}

	if (isV2CloudEnabled) return null;

	return (
		<AnimatePresence>
			{!dismissed && (
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 8 }}
					transition={{ duration: 0.2 }}
					className="px-3 pb-2"
				>
					<SidebarCard
						badge="Legacy"
						title="You're viewing the legacy dashboard"
						description="Superset v2 is available. Switch back in Settings → Experimental."
						actionLabel="Switch to v2"
						onAction={handleManage}
						onDismiss={handleDismiss}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
