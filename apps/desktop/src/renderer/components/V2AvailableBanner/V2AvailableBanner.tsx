import { SidebarCard } from "@superset/ui/sidebar-card";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { useV2AvailableBannerStore } from "renderer/stores/v2-available-banner";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

/**
 * Surfaced in the LEGACY (v1) sidebar whenever v2 is not active.
 *
 * Two distinct states:
 *  - **Invitation** (`optInV2 !== false` — pre-cutoff user who never opted
 *    in, or whose localStorage opt-in was lost, see #5498): v2 is available
 *    and the card explains they are on the legacy dashboard with a switch
 *    path (Settings → Experimental). Dismissible — but the dismissal is
 *    reset whenever v2 becomes active, so a later silent fallback (lost
 *    override) re-surfaces the warning instead of hiding it forever behind
 *    a stale dismissal.
 *  - **Opted out** (`optInV2 === false` — explicit opt-out, including
 *    v2-only users): the user chose legacy. Card states the legacy view
 *    without an invitation action and is not dismissible (nothing to
 *    dismiss — they opted out on purpose).
 */
export function V2AvailableBanner() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const optedOut = useV2LocalOverrideStore((s) => s.optInV2 === false);
	const dismissed = useV2AvailableBannerStore((s) => s.dismissed);
	const dismiss = useV2AvailableBannerStore((s) => s.dismiss);
	const resetDismiss = useV2AvailableBannerStore((s) => s.resetDismiss);
	const navigate = useNavigate();

	// Re-arm the banner whenever v2 is active, so a subsequent silent
	// fallback to v1 (lost localStorage override, #5498) shows the warning
	// even if the user dismissed the invitation earlier.
	useEffect(() => {
		if (isV2CloudEnabled && dismissed) {
			resetDismiss();
		}
	}, [isV2CloudEnabled, dismissed, resetDismiss]);

	function handleManage() {
		track("v2_banner_manage_clicked");
		navigate({ to: "/settings/experimental" });
	}

	function handleDismiss() {
		track("v2_banner_dismissed");
		dismiss();
	}

	if (isV2CloudEnabled) return null;

	if (optedOut) {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="px-3 pb-2"
			>
				<SidebarCard
					badge="Legacy"
					title="You're viewing the legacy dashboard"
					description="v2 was turned off in Settings → Experimental."
				/>
			</motion.div>
		);
	}

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
