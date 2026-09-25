import { useCallback, useMemo } from "react";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { buildHint } from "../hint";
import { tierFor } from "../tiers";
import type {
	LinkAction,
	LinkTierMap,
	ModifierEvent,
	ResolvedClick,
	Surface,
	TierMode,
} from "../types";

export interface ClickPolicy {
	resolve: (event: ModifierEvent) => ResolvedClick;
	getAction: (event: ModifierEvent) => LinkAction | null;
	/** Which tier (if any) maps to the given action in the active map. */
	tierForAction: (action: LinkAction) => keyof LinkTierMap | null;
	hint: string;
	map: LinkTierMap;
}

const TIER_ORDER: (keyof LinkTierMap)[] = [
	"plain",
	"shift",
	"meta",
	"metaShift",
];

function tierForActionIn(
	map: LinkTierMap,
	action: LinkAction,
): keyof LinkTierMap | null {
	for (const tier of TIER_ORDER) {
		if (map[tier] === action) return tier;
	}
	return null;
}

/**
 * Build a memoized policy from a tier map. Centralized so every policy hook
 * (sidebar / terminal / inline) shares identical semantics.
 */

type MapKey = "fileLinks" | "urlLinks" | "sidebarFileLinks";

export function usePolicy(
	key: MapKey,
	surface: Surface,
	mode: TierMode,
): ClickPolicy {
	const { preferences } = useUserPreferences();
	const map = preferences[key];
	const resolve = useCallback(
		(event: ModifierEvent): ResolvedClick => {
			const tier = tierFor(event, mode);
			return { tier, action: map[tier] };
		},
		[map, mode],
	);
	const getAction = useCallback(
		(event: ModifierEvent) => resolve(event).action,
		[resolve],
	);
	const tierForAction = useCallback(
		(action: LinkAction) => tierForActionIn(map, action),
		[map],
	);
	const hint = useMemo(
		() => buildHint(map, surface, mode),
		[map, surface, mode],
	);
	return { resolve, getAction, tierForAction, hint, map };
}
