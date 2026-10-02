import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
	const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
	query?.addEventListener("change", onChange);
	return () => query?.removeEventListener("change", onChange);
}

function prefersReducedMotion() {
	return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

const PIXELS_PER_SECOND = 32;
const MIN_SCROLL_DURATION_S = 0.5;
const MAX_SCROLL_DURATION_S = 6;
const SCROLL_START_DELAY_S = 0.35;
const RESET_DURATION_S = 0.2;
// Absorbs device-pixel rounding that would otherwise jiggle flush text.
const OVERFLOW_EPSILON_PX = 1.5;
const EDGE_FADE_PX = 14;

interface MarqueeTextProps {
	children: ReactNode;
	title: string;
	className?: string;
	forceActive?: boolean;
}

export function MarqueeText({
	children,
	title,
	className,
	forceActive = false,
}: MarqueeTextProps) {
	const containerRef = useRef<HTMLSpanElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const [overflow, setOverflow] = useState(0);
	const [hovered, setHovered] = useState(false);

	const measureOverflow = useCallback(() => {
		const container = containerRef.current;
		const text = textRef.current;
		if (!container || !text) return;
		const next = text.scrollWidth - container.clientWidth;
		setOverflow(next > OVERFLOW_EPSILON_PX ? next : 0);
	}, []);

	useLayoutEffect(() => {
		if (!title) return;
		measureOverflow();
		const container = containerRef.current;
		if (!container || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measureOverflow);
		observer.observe(container);
		return () => observer.disconnect();
	}, [title, measureOverflow]);

	const reducedMotion = useSyncExternalStore(
		subscribeToReducedMotion,
		prefersReducedMotion,
		() => false,
	);

	const active = (hovered || forceActive) && overflow > 0 && !reducedMotion;
	const canScroll = overflow > 0;
	const scrollDurationS = Math.min(
		MAX_SCROLL_DURATION_S,
		Math.max(MIN_SCROLL_DURATION_S, overflow / PIXELS_PER_SECOND),
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: decorative hover reveal, not a control — the full text is already in the DOM for assistive tech regardless of the CSS transform.
		<span
			ref={containerRef}
			title={title}
			className={cn("block overflow-hidden whitespace-nowrap", className)}
			style={{
				maskImage:
					!active && canScroll
						? `linear-gradient(to right, black calc(100% - ${EDGE_FADE_PX}px), transparent 100%)`
						: undefined,
				WebkitMaskImage:
					!active && canScroll
						? `linear-gradient(to right, black calc(100% - ${EDGE_FADE_PX}px), transparent 100%)`
						: undefined,
			}}
			onMouseEnter={() => {
				measureOverflow();
				setHovered(true);
			}}
			onMouseLeave={() => setHovered(false)}
		>
			<span
				ref={textRef}
				className="inline-block whitespace-nowrap"
				style={{
					transform: active ? `translateX(-${overflow}px)` : undefined,
					transition: canScroll
						? active
							? `transform ${scrollDurationS}s linear ${SCROLL_START_DELAY_S}s`
							: `transform ${RESET_DURATION_S}s ease`
						: undefined,
				}}
			>
				{children}
			</span>
		</span>
	);
}
