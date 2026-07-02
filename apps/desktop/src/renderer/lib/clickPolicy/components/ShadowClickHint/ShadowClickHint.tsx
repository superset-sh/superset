import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";

/** Match the radix Tooltip `delayDuration` used elsewhere in the sidebar. */
const DEFAULT_HINT_DELAY_MS = 500;

interface ShadowClickHintProps {
	hint: string;
	side?: "top" | "right" | "bottom" | "left";
	/**
	 * Delay before the hint appears after a row is hovered, in ms. Mirrors the
	 * radix Tooltip delay used by the changes tree rows so both trees feel the
	 * same. This tooltip is forced `open`, so the delay lives in the hover
	 * timer rather than in radix's `delayDuration`.
	 */
	delayMs?: number;
	/**
	 * Walk an event's composed path to find the row to anchor on. Return null
	 * to dismiss. Pierre's open shadow root retargets event.target to the
	 * host, so this needs to use composedPath() to cross the boundary.
	 */
	findRow: (e: React.MouseEvent) => HTMLElement | null;
	children: React.ReactNode;
}

/**
 * Renders a controlled shadcn Tooltip anchored to the bounding rect of the
 * row currently hovered inside `children`. Use for rows that live inside
 * an open shadow root (e.g. the Pierre file tree) where we can't wrap each
 * row in a Tooltip directly.
 */
export function ShadowClickHint({
	hint,
	side = "right",
	delayMs = DEFAULT_HINT_DELAY_MS,
	findRow,
	children,
}: ShadowClickHintProps) {
	const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
	const hoverRowRef = useRef<HTMLElement | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearTimer = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const handleMouseOver = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const row = findRow(e);
			if (!row) {
				if (hoverRowRef.current) {
					hoverRowRef.current = null;
					clearTimer();
					setHoverRect(null);
				}
				return;
			}
			if (hoverRowRef.current === row) return;
			hoverRowRef.current = row;
			clearTimer();
			setHoverRect(null);
			timerRef.current = setTimeout(() => {
				// Re-read the rect on fire in case the row shifted during the delay.
				if (hoverRowRef.current === row) {
					setHoverRect(row.getBoundingClientRect());
				}
			}, delayMs);
		},
		[findRow, delayMs, clearTimer],
	);

	const handleMouseLeave = useCallback(() => {
		hoverRowRef.current = null;
		clearTimer();
		setHoverRect(null);
	}, [clearTimer]);

	useEffect(() => clearTimer, [clearTimer]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: wraps a custom-element host with its own keyboard nav
		// biome-ignore lint/a11y/useKeyWithMouseEvents: hover-tooltip anchoring is mouse-only by nature
		<div
			className="contents"
			onMouseOver={handleMouseOver}
			onMouseLeave={handleMouseLeave}
		>
			{hoverRect && hint && (
				<Tooltip open>
					<TooltipTrigger asChild>
						<span
							aria-hidden
							style={{
								position: "fixed",
								left: hoverRect.left,
								top: hoverRect.top,
								width: hoverRect.width,
								height: hoverRect.height,
								pointerEvents: "none",
							}}
						/>
					</TooltipTrigger>
					<TooltipContent side={side}>{hint}</TooltipContent>
				</Tooltip>
			)}
			{children}
		</div>
	);
}
