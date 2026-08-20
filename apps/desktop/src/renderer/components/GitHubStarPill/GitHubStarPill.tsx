import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedStarButton } from "renderer/components/AnimatedStarButton";
import {
	canActivateStarAction,
	useGithubStarAction,
	useJustStarredWindow,
	useTrackShownOnce,
} from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";

interface GitHubStarPillProps {
	className?: string;
	/** Analytics surface tag; defaults to "empty_state" for the original callers. */
	surface?: "empty_state" | "new_workspace";
	/**
	 * Keep the pill's layout box mounted (just faded to invisible) instead of
	 * unmounting it once starred. The empty-state screens sit at the bottom of
	 * a plain block, so a height collapse there is harmless; the new-workspace
	 * screen centers its content with `justify-center`, where that same
	 * collapse re-centers everything above it. Off by default so the two
	 * existing callers keep their original unmount-on-hide behavior.
	 */
	reserveSpace?: boolean;
}

/**
 * Small, always-optional "Star Superset on GitHub" pill for the empty
 * "no pane open" screens (v1 EmptyTabView and v2 WorkspaceEmptyState) and
 * the new-workspace screen. Renders straight from live `state`, with no
 * nag-suppression layer — unlike the sidebar card/toast, this is a low-key
 * status indicator, not an interruptive campaign, so it's allowed to be
 * fully truthful: it only shows while `state` is confirmed "not_starred"
 * (a "loading" or "unknown" read isn't trustworthy enough to act on), hides
 * the instant `state` is "starred", and reappears the instant a later
 * unstar is confirmed, without waiting on any mute grace window. It briefly
 * stays mounted past that point so the confetti/label animation on a fresh
 * star has time to play, then dissolves out (fade + soft blur) instead of
 * vanishing instantly.
 */
export function GitHubStarPill({
	className,
	surface = "empty_state",
	reserveSpace = false,
}: GitHubStarPillProps) {
	const { state, activate, isBusy } = useGithubStarAction();
	const celebrating = useJustStarredWindow(state);

	// Fire at most once per showing per surface — reset once hidden (unknown,
	// loading, or the post-celebration hide) so a later re-show, or a
	// re-purposed instance with a different `surface`, gets its own fresh
	// impression instead of inheriting a stale guard.
	useTrackShownOnce(
		canActivateStarAction(state),
		() => track("star_nag_shown", { surface }),
		surface,
	);

	if (state === "loading" && !reserveSpace) return null;

	const isVisible = canActivateStarAction(state) || celebrating;

	const handleClick = () => {
		// A click during the post-star celebration window (state === "starred")
		// reaches this handler but activate() no-ops for it — don't record a
		// "starred" event for a click that didn't actually do anything.
		if (canActivateStarAction(state)) track("star_nag_starred", { surface });
		activate();
	};

	if (reserveSpace) {
		// Always mounted so the button's box keeps occupying its slot — only
		// opacity/interactivity change, never the layout.
		return (
			<motion.div
				animate={{ opacity: isVisible ? 1 : 0 }}
				transition={{ duration: 0.32, ease: "easeOut" }}
				style={{ pointerEvents: isVisible ? "auto" : "none" }}
				aria-hidden={!isVisible}
				inert={!isVisible}
				className={cn("flex items-center justify-center", className)}
			>
				<AnimatedStarButton
					state={state}
					busy={isBusy}
					onActivate={handleClick}
				/>
			</motion.div>
		);
	}

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					key="star-pill"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, scale: 0.92, filter: "blur(3px)" }}
					transition={{ duration: 0.32, ease: "easeOut" }}
					className={cn("flex items-center justify-center", className)}
				>
					<AnimatedStarButton
						state={state}
						busy={isBusy}
						onActivate={handleClick}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
