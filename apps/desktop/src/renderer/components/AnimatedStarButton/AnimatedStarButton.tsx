import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GithubStarActionState } from "renderer/hooks/useGithubStarAction";
import { STAR_SUCCESS_ANIMATION_MS } from "renderer/hooks/useGithubStarAction";
import "./AnimatedStarButton.css";
import { PlusMark } from "./components/PlusMark";

// Four corner marks, positioned via offset-path purely by DOM order (see
// AnimatedStarButton.css) — never reordered, so a stable static key per
// corner is correct here.
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];

// Star = gold, matching GitHub's own convention and every other star icon
// anywhere. Emerald is this app's existing "success" token (see e.g.
// WorkspaceAheadBehind, ChecksList) — reused here instead of inventing a new
// accent. Deliberately not amber-adjacent beyond the star itself: amber
// already means "pending/warning" elsewhere in this app (PRIcon, git
// ahead/behind, unstaged changes), so doubling it up as a "success" color
// here would collide with that meaning.
const CONFETTI_COLORS = ["#fbbf24", "#34d399", "#fbbf24"];
const PARTICLE_COUNT = 8;

interface Particle {
	id: number;
	angle: number;
	distance: number;
	rotate: number;
	color: string;
	size: number;
}

function createBurst(): Particle[] {
	return Array.from({ length: PARTICLE_COUNT }, (_, id) => ({
		id,
		angle: (Math.PI * 2 * id) / PARTICLE_COUNT + Math.random() * 0.5,
		distance: 16 + Math.random() * 14,
		rotate: Math.random() * 360 - 180,
		color: CONFETTI_COLORS[id % CONFETTI_COLORS.length] as string,
		size: 3 + Math.random() * 2,
	}));
}

interface AnimatedStarButtonProps {
	state: GithubStarActionState;
	busy: boolean;
	onActivate: () => void;
	className?: string;
	/** Smaller padding/font — for tighter contexts like the onboarding toast. */
	compact?: boolean;
}

/**
 * Shared "Star on GitHub" button for the empty-state pill, sidebar card, and
 * onboarding toast. Chrome (padding, monospace uppercase label, color-mix
 * background, sharp corners, four plus marks relaying around the border on
 * hover) is a direct port of a reference design — see AnimatedStarButton.css
 * for the full port and the one deliberate deviation (transition placement,
 * a correctness fix, not a style change). The star icon, its pop-on-success,
 * the label crossfade, and the confetti burst are this component's own,
 * layered on top via Framer Motion.
 */
export function AnimatedStarButton({
	state,
	busy,
	onActivate,
	className,
	compact,
}: AnimatedStarButtonProps) {
	const { t } = useLingui();
	const [particles, setParticles] = useState<Particle[]>([]);
	const [justStarred, setJustStarred] = useState(false);
	const prevStateRef = useRef(state);
	const prefersReducedMotion = useReducedMotion();

	useEffect(() => {
		const prevState = prevStateRef.current;
		prevStateRef.current = state;
		// Matches useJustStarredWindow's transition condition (not just "wasn't
		// starred before") — a cold mount that resolves straight from "loading"
		// to "starred" (the repo was already starred before this session) isn't
		// a fresh star and shouldn't burst confetti for it.
		if (
			(prevState === "not_starred" || prevState === "unknown") &&
			state === "starred"
		) {
			setJustStarred(true);
			if (!prefersReducedMotion) setParticles(createBurst());
			const clearTimer = setTimeout(() => {
				setJustStarred(false);
				setParticles([]);
			}, STAR_SUCCESS_ANIMATION_MS);
			return () => clearTimeout(clearTimer);
		}
	}, [state, prefersReducedMotion]);

	const isStarred = state === "starred";
	const label = isStarred
		? t({ message: "Starred" })
		: busy
			? t({
					message: "Starring…",
				})
			: t({
					message: "Star on GitHub",
				});

	return (
		<button
			type="button"
			onClick={onActivate}
			disabled={busy || (state !== "not_starred" && state !== "starred")}
			className={cn(
				"star-button group",
				compact && "star-button--compact",
				className,
			)}
		>
			<span className="star-button__corners" aria-hidden="true">
				{CORNERS.map((corner) => (
					<span key={corner}>
						<PlusMark />
					</span>
				))}
			</span>
			<span className="relative z-10 flex size-3.5 shrink-0 items-center justify-center">
				<motion.span
					animate={
						justStarred && !prefersReducedMotion
							? { scale: [1, 1.22, 1] }
							: { scale: 1 }
					}
					transition={{ duration: 0.4, ease: "easeOut", times: [0, 0.45, 1] }}
					className="block"
				>
					<Star
						className={cn(
							"size-3.5 transition-colors",
							isStarred
								? "fill-amber-400 text-amber-400"
								: "group-hover:fill-amber-400/70 group-hover:text-amber-400/70 group-active:fill-amber-400 group-active:text-amber-400",
						)}
					/>
				</motion.span>
				<AnimatePresence>
					{particles.map((p) => (
						<motion.span
							key={p.id}
							initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
							animate={{
								opacity: 0,
								x: Math.cos(p.angle) * p.distance,
								y: Math.sin(p.angle) * p.distance,
								rotate: p.rotate,
								scale: 0.4,
							}}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.9, ease: "easeOut" }}
							className="pointer-events-none absolute left-1/2 top-1/2 rounded-sm"
							style={{
								width: p.size,
								height: p.size,
								backgroundColor: p.color,
							}}
						/>
					))}
				</AnimatePresence>
			</span>
			<span className="relative z-10 inline-block overflow-hidden">
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={label}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						className="block"
					>
						{label}
					</motion.span>
				</AnimatePresence>
			</span>
		</button>
	);
}
