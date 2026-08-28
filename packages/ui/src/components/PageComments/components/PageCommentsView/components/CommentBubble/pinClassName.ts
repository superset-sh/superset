import { cn } from "../../../../../../lib/utils";

/**
 * Pins float over reader-authored HTML, so they cannot take their colours from
 * the app theme: a `bg-primary` pin is near-white in the desktop's dark theme
 * and vanishes on a light page. Instead the fill is fixed and saturated enough
 * to read on a white page, and the white ring separates it from a dark one —
 * the same trick Figma and Liveblocks use. Both hold in either app theme.
 */
export function pinClassName({
	resolved,
	active,
	interactive = false,
}: {
	resolved: boolean;
	active: boolean;
	interactive?: boolean;
}): string {
	return cn(
		"absolute top-0 left-0 flex size-6 items-center justify-center rounded-full rounded-bl-sm font-medium text-[10px] text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-1 ring-white transition-colors",
		resolved ? "bg-neutral-500" : "bg-blue-600",
		interactive &&
			cn(
				"pointer-events-auto",
				resolved ? "hover:bg-neutral-400" : "hover:bg-blue-500",
			),
		// Deepen the fill rather than growing the pin: a pin that changes size
		// on click shifts under the cursor that just hit it.
		active && (resolved ? "bg-neutral-600" : "bg-blue-800"),
	);
}
