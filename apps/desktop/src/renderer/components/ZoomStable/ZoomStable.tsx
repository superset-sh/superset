import type { ReactNode } from "react";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";

interface ZoomStableProps {
	/**
	 * When true, counter-scale the children by `1 / zoomFactor` so they keep a
	 * constant physical size under page zoom. Typically gated on macOS, where the
	 * surrounding chrome is pinned to the fixed traffic lights and must not scale.
	 */
	enabled: boolean;
	className?: string;
	children: ReactNode;
}

/**
 * Keeps its children a constant physical size under Electron page zoom by
 * applying `zoom: 1 / zoomFactor`. Use it inside chrome whose height/inset is
 * pinned to the fixed macOS traffic lights, so icon controls don't grow past
 * the pinned row and overflow when the user zooms the page in.
 *
 * Keep the wrapper content-sized — avoid `w-full` / `h-full` / `flex-1` on it.
 * CSS `zoom` scales percentage-based sizes too, so a stretched child would
 * under/overflow. Percentage sizing and the traffic-light inset belong on the
 * surrounding row, which stays in the normal (un-zoomed) coordinate space.
 */
export function ZoomStable({ enabled, className, children }: ZoomStableProps) {
	const zoomFactor = useZoomFactor();
	return (
		<div
			className={className}
			style={enabled ? { zoom: 1 / zoomFactor } : undefined}
		>
			{children}
		</div>
	);
}
