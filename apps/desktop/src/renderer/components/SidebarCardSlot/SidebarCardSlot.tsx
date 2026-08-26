import { SidebarCard } from "@superset/ui/sidebar-card";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { SidebarCardEntry } from "./types";

interface SidebarCardSlotProps {
	isCollapsed?: boolean;
	/**
	 * Candidates in priority order, highest first. Ineligible cards pass `null`.
	 */
	entries: (SidebarCardEntry | null)[];
}

/**
 * The sidebar's one card slot. Every promo, nag and alert card competes for it
 * and at most one renders — previously each mounted itself as an independent
 * sibling, so an org with a failed payment, an unconfigured project and both
 * nag flags on stacked four cards above the footer with nothing arbitrating.
 *
 * Owns the shell the cards used to each re-implement: the collapse check, the
 * motion wrapper (which had already drifted between copies) and the once-per-
 * showing `onShown` call.
 */
export function SidebarCardSlot({
	isCollapsed,
	entries,
}: SidebarCardSlotProps) {
	const entry = entries.find((candidate) => candidate != null) ?? null;
	const visibleKey =
		isCollapsed || !entry ? null : (entry.shownKey ?? entry.id);

	// Held in a ref so an inline `onShown` closure re-identifying on every
	// render can't re-fire the impression — it fires when the winner changes.
	const onShownRef = useRef(entry?.onShown);
	onShownRef.current = entry?.onShown;

	useEffect(() => {
		if (!visibleKey) return;
		onShownRef.current?.();
	}, [visibleKey]);

	return (
		<AnimatePresence mode="wait">
			{!isCollapsed && entry && (
				<motion.div
					key={entry.id}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 8 }}
					transition={{ duration: 0.2 }}
					className="px-3 pb-2"
				>
					<SidebarCard
						badge={entry.badge}
						title={entry.title}
						description={entry.description}
						actionLabel={entry.actionLabel}
						onAction={entry.onAction}
						onDismiss={entry.onDismiss}
						className={entry.className}
					>
						{entry.children}
					</SidebarCard>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
