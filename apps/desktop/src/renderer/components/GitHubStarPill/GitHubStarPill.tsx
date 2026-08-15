import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
	AnimatedStarButton,
	STAR_SUCCESS_ANIMATION_MS,
} from "renderer/components/AnimatedStarButton";
import type { GithubStarActionState } from "renderer/hooks/useGithubStarAction";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";

interface GitHubStarPillProps {
	className?: string;
}

/**
 * Small, always-optional "Star Superset on GitHub" pill for the empty
 * "no pane open" screens (v1 EmptyTabView and v2 WorkspaceEmptyState).
 * Renders straight from live `state`, with no nag-suppression layer — unlike
 * the sidebar card/toast, this is a low-key status indicator, not an
 * interruptive campaign, so it's allowed to be fully truthful: it hides the
 * instant `state` is "starred" and reappears the instant a later unstar is
 * confirmed, without waiting on any mute grace window. It briefly stays
 * mounted past that point so the confetti/label animation on a fresh star
 * has time to play, then dissolves out (fade + soft blur) instead of
 * vanishing instantly.
 */
export function GitHubStarPill({ className }: GitHubStarPillProps) {
	const { state, activate, isBusy } = useGithubStarAction();
	const prevStateRef = useRef<GithubStarActionState | null>(null);

	// Computed synchronously during render (not inside the effect below) so
	// the hide check further down can't lag a render behind the state flip.
	// That lag used to unmount this component's child AnimatedStarButton for
	// exactly one render right as `state` became "starred" — before
	// staysVisibleForAnimation had a chance to flip true — which reset
	// AnimatedStarButton's own "was I just starred" ref on remount and
	// silently dropped its confetti/pop celebration.
	const prevState = prevStateRef.current;
	prevStateRef.current = state;
	const justStarred =
		(prevState === "not_starred" || prevState === "unknown") &&
		state === "starred";

	// Separate ref + effect from the render-time justStarred above, and keyed
	// on `state` rather than `justStarred`: `justStarred` itself flips back to
	// false on the very next render (setStaysVisibleForAnimation(true) causes
	// a re-render, and prevStateRef has already advanced to "starred" by
	// then) — if this effect depended on `justStarred` directly, that flip
	// would re-run it, firing the cleanup that cancels the just-started timer
	// before it ever fires, and no replacement timer gets scheduled since
	// justStarred is false by then. Keying on `state` (which only changes
	// once) keeps the timer alive for its full duration instead.
	const [staysVisibleForAnimation, setStaysVisibleForAnimation] =
		useState(false);
	const prevStateForTimerRef = useRef<GithubStarActionState | null>(null);
	useEffect(() => {
		const prev = prevStateForTimerRef.current;
		prevStateForTimerRef.current = state;
		const justStarredForTimer =
			(prev === "not_starred" || prev === "unknown") && state === "starred";
		if (justStarredForTimer) {
			setStaysVisibleForAnimation(true);
			const timer = setTimeout(
				() => setStaysVisibleForAnimation(false),
				STAR_SUCCESS_ANIMATION_MS,
			);
			return () => clearTimeout(timer);
		}
	}, [state]);

	// Fire at most once per showing — reset once starred so a later unstar
	// that re-shows the pill tracks a fresh "shown" impression instead of
	// staying silent forever after the first one.
	const trackedShownRef = useRef(false);
	useEffect(() => {
		if (state === "starred") {
			trackedShownRef.current = false;
			return;
		}
		if (trackedShownRef.current) return;
		if (state !== "not_starred" && state !== "unknown") return;
		trackedShownRef.current = true;
		track("star_nag_shown", { surface: "empty_state" });
	}, [state]);

	if (state === "loading") return null;

	const isVisible = !(
		state === "starred" &&
		!justStarred &&
		!staysVisibleForAnimation
	);

	const handleClick = () => {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "empty_state",
		});
		activate();
	};

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
