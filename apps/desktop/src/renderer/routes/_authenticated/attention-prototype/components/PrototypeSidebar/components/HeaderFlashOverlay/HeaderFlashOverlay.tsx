import { motion, useAnimationControls } from "framer-motion";
import { useEffect } from "react";

export type HeaderFlashProfile = "hold" | "brief";

/**
 * Flash envelopes. "hold" is the standard ramp-hold-fade used by workspace
 * rows — for headers that should linger (e.g. a hidden arrival the user may
 * want to find). "brief" is bright for the first half of a 0.45s card travel
 * and gone by its end — for an origin the card is visibly leaving, so the eye
 * hands off from header to card instead of seeing two long glows.
 */
const PROFILES: Record<
	HeaderFlashProfile,
	{ duration: number; times: number[] }
> = {
	hold: { duration: 1.4, times: [0, 0.05, 0.5, 1] },
	brief: { duration: 0.5, times: [0, 0.1, 0.4, 1] },
};

interface HeaderFlashOverlayProps {
	/**
	 * Monotonic value that changes when this header should flash (same contract
	 * as the workspace row's flash). 0 = never.
	 */
	flashKey: number;
	/**
	 * Delay before the flash starts — used to sequence origin-then-destination
	 * when a workspace travels between collapsed groups.
	 */
	delayMs: number;
	profile: HeaderFlashProfile;
}

/**
 * Group-header flash overlay: the same highlight as the workspace row, so a
 * collapsed group can signal that a hidden workspace just left or entered it.
 * Resting opacity lives in `style` (an enclosing AnimatePresence
 * initial={false} would suppress an `initial` prop).
 */
export function HeaderFlashOverlay({
	flashKey,
	delayMs,
	profile,
}: HeaderFlashOverlayProps) {
	const flash = useAnimationControls();

	useEffect(() => {
		if (flashKey <= 0) return;
		const envelope = PROFILES[profile];
		flash.set({ opacity: 0 });
		flash.start({
			opacity: [0, 1, 1, 0],
			transition: {
				delay: delayMs / 1000,
				duration: envelope.duration,
				times: envelope.times,
				ease: "easeInOut",
			},
		});
	}, [flashKey, delayMs, profile, flash]);

	return (
		<motion.span
			aria-hidden
			style={{ opacity: 0 }}
			animate={flash}
			className="pointer-events-none absolute inset-0 bg-foreground/25"
		/>
	);
}
