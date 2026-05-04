import type { LinkTier, ModifierEvent, TierMode } from "./types";

/**
 * Resolve a click event to a tier under the given mode.
 *
 * 4-tier mode treats every modifier combination independently:
 *   plain | shift | meta | metaShift
 *
 * 2-tier mode collapses shift into the closest meta-less/meta-ful tier
 * because it runs inside rich-text editors where shift-click is reserved
 * for cursor selection:
 *   plain | meta   (shift→plain, metaShift→meta)
 */
export function tierFor(event: ModifierEvent, mode: TierMode): LinkTier {
	const meta = event.metaKey || event.ctrlKey;
	if (mode === "2-tier") return meta ? "meta" : "plain";
	if (meta) return event.shiftKey ? "metaShift" : "meta";
	return event.shiftKey ? "shift" : "plain";
}
