import { shortActionLabel } from "./actionLabel";
import { modifierLabel } from "./modifierLabel";
import type { LinkTier, LinkTierMap, Surface, TierMode } from "./types";

const TIERS_4: LinkTier[] = ["shift", "meta", "metaShift"];
const TIERS_2: LinkTier[] = ["meta"];

/**
 * Build a "⇧ click: new tab · ⌘ click: editor" hint string from the bound
 * modifier tiers in the given map. Plain is omitted (redundant — describes
 * what already happened on plain click).
 */
export function buildHint(
	map: LinkTierMap,
	surface: Surface,
	mode: TierMode,
): string {
	const tiers = mode === "2-tier" ? TIERS_2 : TIERS_4;
	const parts: string[] = [];
	for (const tier of tiers) {
		const action = map[tier];
		if (action === null) continue;
		parts.push(`${modifierLabel(tier)}: ${shortActionLabel(action, surface)}`);
	}
	return parts.join(" · ");
}

export const UNBOUND_HINT = "Not bound · configure in Settings → Links";
