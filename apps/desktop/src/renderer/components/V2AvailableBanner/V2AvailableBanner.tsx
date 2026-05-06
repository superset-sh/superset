import { SidebarCard } from "@superset/ui/sidebar-card";
import { AnimatePresence, motion } from "framer-motion";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { useV2AvailableBannerStore } from "renderer/stores/v2-available-banner";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

export function V2AvailableBanner() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const dismissed = useV2AvailableBannerStore((s) => s.dismissed);
	const dismiss = useV2AvailableBannerStore((s) => s.dismiss);
	const setOptInV2 = useV2LocalOverrideStore((s) => s.setOptInV2);

	function handleSwitch() {
		track("surface_toggled", { from: "v1", to: "v2", source: "v1_banner" });
		setOptInV2(true);
	}

	function handleDismiss() {
		track("v2_banner_dismissed");
		dismiss();
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
						badge="New"
						title="Superset v2 is here"
						description="The new cloud workspace experience is now available."
						actionLabel={isV2CloudEnabled ? undefined : "Switch to v2"}
						onAction={isV2CloudEnabled ? undefined : handleSwitch}
						onDismiss={handleDismiss}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
