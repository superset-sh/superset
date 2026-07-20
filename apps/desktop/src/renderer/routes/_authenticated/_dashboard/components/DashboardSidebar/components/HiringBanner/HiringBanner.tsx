import { COMPANY, FEATURE_FLAGS } from "@superset/shared/constants";
import { SidebarCard } from "@superset/ui/sidebar-card";
import { AnimatePresence, motion } from "framer-motion";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import { track } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHiringBannerStore } from "renderer/stores/hiring-banner";

export function HiringBanner() {
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.HIRING_BANNER);
	const dismissed = useHiringBannerStore((s) => s.dismissed);
	const dismiss = useHiringBannerStore((s) => s.dismiss);
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();
	const isVisible = isEnabled && !dismissed;

	useEffect(() => {
		if (!isVisible) return;
		track("hiring_banner_shown", { surface: "v2" });
	}, [isVisible]);

	function handleViewRoles() {
		track("hiring_banner_clicked");
		openUrlMutation.mutate(COMPANY.JOIN_US_URL);
	}

	function handleDismiss() {
		track("hiring_banner_dismissed");
		dismiss();
	}

	if (!isEnabled) return null;

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
						badge="We're hiring"
						title="Like building with Superset?"
						description="You're one of our most active users. Come help us build it."
						actionLabel="View open roles"
						onAction={handleViewRoles}
						onDismiss={handleDismiss}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
