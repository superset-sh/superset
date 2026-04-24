import type {
	LinkAction,
	LinkTier,
	LinkTierMap,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export interface MouseEventLike {
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
}

export function terminalTierFor(event: MouseEventLike): LinkTier {
	if (event.metaKey || event.ctrlKey) {
		return event.shiftKey ? "metaShift" : "meta";
	}
	return "plain";
}

export function inlineTierFor(event: MouseEventLike): LinkTier {
	if (event.metaKey || event.ctrlKey) return "meta";
	return "plain";
}

export function actionFor(
	tierMap: LinkTierMap,
	tier: LinkTier,
): LinkAction | null {
	return tierMap[tier];
}
