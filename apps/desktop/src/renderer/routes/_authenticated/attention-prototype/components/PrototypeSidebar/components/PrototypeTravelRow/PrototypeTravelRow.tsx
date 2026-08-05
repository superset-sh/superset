import { AnimatePresence, motion, type Variants } from "framer-motion";
import { type ReactNode, useLayoutEffect, useRef } from "react";

/** Matches the row layout tween so travel reads at the same speed. */
export const TRAVEL_DURATION_S = 0.45;
const TRAVEL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const TRAVEL_EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

interface TravelCustom {
	travel: boolean;
}

/**
 * Outer "slot" element: opens/closes the row's space in the list. Plain
 * collapse matches the real sidebar (0.15s easeOut height); a travel exit
 * closes slowly in sync with the card's journey so siblings glide, not snap.
 */
const slotVariants: Variants = {
	hidden: { height: 0 },
	visible: {
		height: "auto",
		transition: { duration: 0.15, ease: "easeOut" },
	},
	exit: (custom: TravelCustom | undefined) => ({
		height: 0,
		transition: custom?.travel
			? { duration: TRAVEL_DURATION_S, ease: TRAVEL_EASE }
			: { duration: 0.15, ease: "easeOut" },
	}),
};

/**
 * Inner "card" element: on a travel exit the card stays opaque for most of
 * the journey and fades out only on arrival. The journey itself (gliding from
 * the old list position to the collapsed destination header) is a WAAPI
 * translate the sidebar runs on the slot — by exit time React has already
 * relocated the slot's DOM node to rest just under the destination header, so
 * "arriving" simply means translating back to y 0. No aim math, no overshoot.
 */
const cardVariants: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { duration: 0.15, ease: "easeOut" },
	},
	exit: (custom: TravelCustom | undefined) =>
		custom?.travel
			? {
					opacity: [1, 0.9, 0],
					transition: {
						duration: TRAVEL_DURATION_S,
						times: [0, 0.55, 1],
						ease: "easeInOut",
					},
				}
			: { opacity: 0, transition: { duration: 0.15, ease: "easeOut" } },
};

/**
 * Highlight riding along on a travel exit. The row's own flash overlay can't
 * fire here — AnimatePresence freezes exiting children with their previous
 * props, so the fresh flashKey never reaches them — so the highlight is baked
 * into the exit variant instead: bright almost immediately, then gone with
 * the card.
 */
const travelHighlightVariants: Variants = {
	hidden: { opacity: 0 },
	visible: { opacity: 0 },
	exit: (custom: TravelCustom | undefined) =>
		custom?.travel
			? {
					opacity: [0, 1, 1],
					transition: {
						duration: TRAVEL_DURATION_S,
						times: [0, 0.1, 1],
						ease: "easeInOut",
					},
				}
			: { opacity: 0 },
};

interface PrototypeTravelRowProps {
	/** False when the row's group is collapsed — unmounts (animated) the row. */
	visible: boolean;
	/**
	 * True on the render that hides the row into a collapsed destination.
	 * Consumed by the exit variants via AnimatePresence `custom` (exiting
	 * children are frozen with their previous props, so the fresh value must
	 * travel through `custom`). The sidebar pairs this with a WAAPI glide on
	 * the slot from its old position.
	 */
	exitTravel: boolean;
	/**
	 * Viewport-Y of the collapsed ORIGIN group header. Non-null only on the
	 * render that mounts the row; the card then fades in quickly at that
	 * location and glides to its final position.
	 */
	enterFromTop: number | null;
	/** Registers the slot element for the sidebar's position bookkeeping. */
	registerEl: (el: HTMLElement | null) => void;
	/**
	 * True while a drag is hovering this row's group as a cross-column drop
	 * target — tints the row so the whole destination column reads as one.
	 */
	highlighted?: boolean;
	children: ReactNode;
}

/**
 * Collapse/expand wrapper for a prototype row (per-row AnimatePresence, as in
 * the real DashboardSidebarExpandedProjectContent), extended with "travel"
 * animations: exits gliding into a collapsed destination header, and
 * entrances emerging from a collapsed origin header. Neither element is
 * overflow-hidden — clipping would hide rows the moment dnd-kit translates
 * them mid-drag.
 */
export function PrototypeTravelRow({
	visible,
	exitTravel,
	enterFromTop,
	registerEl,
	highlighted = false,
	children,
}: PrototypeTravelRowProps) {
	const cardRef = useRef<HTMLDivElement>(null);

	// Travel entrance: framer can't know the offset before the row has laid
	// out, so measure post-layout/pre-paint and run a transient WAAPI animation
	// on top (it composites over framer's 0.15s opacity enter and leaves no
	// inline styles behind).
	useLayoutEffect(() => {
		if (!visible || enterFromTop == null) return;
		const el = cardRef.current;
		if (!el) return;
		const delta = enterFromTop - el.getBoundingClientRect().top;
		if (!Number.isFinite(delta) || Math.abs(delta) < 4) return;
		el.animate(
			[
				{ transform: `translateY(${delta}px)`, opacity: 0 },
				{ transform: `translateY(${delta * 0.7}px)`, opacity: 1, offset: 0.3 },
				{ transform: "translateY(0px)", opacity: 1 },
			],
			{ duration: TRAVEL_DURATION_S * 1000, easing: TRAVEL_EASE_CSS },
		);
	}, [visible, enterFromTop]);

	return (
		<AnimatePresence initial={false} custom={{ travel: exitTravel }}>
			{visible && (
				<motion.div
					ref={registerEl}
					variants={slotVariants}
					initial="hidden"
					animate="visible"
					exit="exit"
				>
					<motion.div
						ref={cardRef}
						variants={cardVariants}
						className="relative"
					>
						{children}
						{highlighted && (
							<span
								aria-hidden
								className="pointer-events-none absolute inset-0 bg-primary/10"
							/>
						)}
						<motion.span
							aria-hidden
							style={{ opacity: 0 }}
							variants={travelHighlightVariants}
							className="pointer-events-none absolute inset-0 bg-foreground/25"
						/>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
