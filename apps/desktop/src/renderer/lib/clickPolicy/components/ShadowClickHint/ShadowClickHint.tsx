import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useRef, useState } from "react";

interface ShadowClickHintProps {
	hint: string;
	side?: "top" | "right" | "bottom" | "left";
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
	findRow,
	children,
}: ShadowClickHintProps) {
	const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
	const hoverRowRef = useRef<HTMLElement | null>(null);

	const handleMouseOver = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const row = findRow(e);
			if (!row) {
				if (hoverRowRef.current) {
					hoverRowRef.current = null;
					setHoverRect(null);
				}
				return;
			}
			if (hoverRowRef.current === row) return;
			hoverRowRef.current = row;
			setHoverRect(row.getBoundingClientRect());
		},
		[findRow],
	);

	const handleMouseLeave = useCallback(() => {
		hoverRowRef.current = null;
		setHoverRect(null);
	}, []);

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
