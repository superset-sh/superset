import { FEATURE_FLAGS } from "@superset/shared/constants";
import { SidebarCard } from "@superset/ui/sidebar-card";
import { AnimatePresence, motion } from "framer-motion";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useReducer, useRef, useState } from "react";
import {
	AnimatedStarButton,
	STAR_SUCCESS_ANIMATION_MS,
} from "renderer/components/AnimatedStarButton";
import type { GithubStarActionState } from "renderer/hooks/useGithubStarAction";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";
import { useStarNagStore } from "renderer/stores/star-nag";

interface StarNagCardProps {
	isCollapsed?: boolean;
}

/**
 * Sidebar card offering to star superset-sh/superset once the user has
 * created enough workspaces to have proven they're getting real use out of
 * the app. Modeled directly on HiringBanner — same SidebarCard shell, same
 * feature-flag kill switch, same shown/clicked/dismissed telemetry shape.
 */
export function StarNagCard({ isCollapsed }: StarNagCardProps) {
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.STAR_NAG_CARD);
	const shouldShow = useStarNagStore((s) => s.shouldShowThresholdCard());
	const deferredUntil = useStarNagStore((s) => s.deferredUntil);
	const dismiss = useStarNagStore((s) => s.dismiss);
	// The card is mounted unconditionally in both sidebars regardless of the
	// flag or collapsed state. StarNagObserver's own always-on query already
	// covers the pill/toast/settings row's need for a live read regardless of
	// this flag, so gating this instance can't stop `gh` from ever being
	// called for a disabled user — it only avoids a second, redundant active
	// query observer (and its own extra mount-time refetch) tied to this
	// card's collapse/expand and flag-load cycles specifically.
	const { state, activate, isBusy } = useGithubStarAction({
		enabled: !isCollapsed && isEnabled === true,
	});

	// shouldShowThresholdCard() is only re-evaluated when the store itself
	// changes — a cooldown expiring is a pure passage of time, not a store
	// write, so without this the card stays hidden past its cooldown until
	// something unrelated (e.g. creating another workspace) happens to write
	// to the store. Force a re-render right when the cooldown actually ends.
	const [, forceRecheck] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		if (!deferredUntil) return;
		const msUntilExpiry = deferredUntil - Date.now();
		if (msUntilExpiry <= 0) return;
		const timer = setTimeout(forceRecheck, msUntilExpiry);
		return () => clearTimeout(timer);
	}, [deferredUntil]);

	// Starring calls markCompleted() internally, which flips shouldShow to
	// false immediately — without this, the card would unmount before the
	// AnimatedStarButton's confetti/label animation gets a chance to play.
	const [staysVisibleForAnimation, setStaysVisibleForAnimation] =
		useState(false);
	const prevStateRef = useRef<GithubStarActionState | null>(null);

	useEffect(() => {
		const prev = prevStateRef.current;
		prevStateRef.current = state;
		const justStarred =
			(prev === "not_starred" || prev === "unknown") && state === "starred";
		if (justStarred) {
			setStaysVisibleForAnimation(true);
			const timer = setTimeout(
				() => setStaysVisibleForAnimation(false),
				STAR_SUCCESS_ANIMATION_MS,
			);
			return () => clearTimeout(timer);
		}
	}, [state]);

	const renderVisible = shouldShow || staysVisibleForAnimation;
	const isVisible = !isCollapsed && isEnabled && shouldShow;

	// Fire at most once per visible showing — without the reset, every
	// sidebar collapse/expand cycle re-triggers this effect and inflates
	// impressions relative to the other surfaces' once-per-showing trackers.
	const trackedShownRef = useRef(false);
	useEffect(() => {
		if (!isVisible) {
			trackedShownRef.current = false;
			return;
		}
		if (trackedShownRef.current) return;
		trackedShownRef.current = true;
		track("star_nag_shown", { surface: "card" });
	}, [isVisible]);

	function handleAction() {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "card",
		});
		activate();
	}

	function handleDismiss() {
		track("star_nag_dismissed", { surface: "card" });
		dismiss();
	}

	if (isCollapsed || !isEnabled) return null;

	return (
		<AnimatePresence>
			{renderVisible && (
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 8 }}
					transition={{ duration: 0.2 }}
					className="px-3 pb-2"
				>
					<SidebarCard
						title="Enjoying Superset?"
						description="Superset is open source. If it's helped you today, a GitHub star helps other developers find it."
						onDismiss={handleDismiss}
					>
						<AnimatedStarButton
							state={state}
							busy={isBusy}
							onActivate={handleAction}
							className="mt-3 w-full justify-center"
						/>
					</SidebarCard>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
