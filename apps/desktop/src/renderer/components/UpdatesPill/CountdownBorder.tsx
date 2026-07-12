import { cn } from "@superset/ui/utils";
import { useLayoutEffect, useRef, useState } from "react";

const STROKE_WIDTH = 1.5;

interface CountdownBorderProps {
	/** How long the line takes to wrap all the way around, in ms */
	durationMs: number;
	/**
	 * Corner radius matching the host element. "pill" measures the host and
	 * uses half its height — SVG clamps rx against width and ry against
	 * height separately, so an oversized rx would go elliptical instead of
	 * matching a rounded-full border.
	 */
	radius: number | "pill";
	className?: string;
}

/**
 * A line that progressively traces the host element's border, signalling
 * how long until the element goes away. Host must be `position: relative`.
 */
export function CountdownBorder({
	durationMs,
	radius,
	className,
}: CountdownBorderProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [measuredRadius, setMeasuredRadius] = useState<number | null>(null);

	useLayoutEffect(() => {
		if (radius !== "pill" || !svgRef.current) return;
		setMeasuredRadius((svgRef.current.clientHeight - STROKE_WIDTH) / 2);
	}, [radius]);

	const cornerRadius = radius === "pill" ? measuredRadius : radius;

	return (
		<svg
			ref={svgRef}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 size-full",
				className,
			)}
		>
			{cornerRadius !== null && (
				<rect
					rx={cornerRadius}
					fill="none"
					strokeWidth={STROKE_WIDTH}
					strokeLinecap="round"
					pathLength={100}
					strokeDasharray={100}
					className="stroke-emerald-500/35"
					style={{
						x: STROKE_WIDTH / 2,
						y: STROKE_WIDTH / 2,
						width: `calc(100% - ${STROKE_WIDTH}px)`,
						height: `calc(100% - ${STROKE_WIDTH}px)`,
						animation: `countdown-border-trace ${durationMs}ms linear both`,
					}}
				/>
			)}
		</svg>
	);
}
