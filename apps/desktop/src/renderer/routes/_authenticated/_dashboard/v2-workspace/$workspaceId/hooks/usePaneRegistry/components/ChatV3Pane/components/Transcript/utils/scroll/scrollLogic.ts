import type { TurnGroup } from "@superset/chat/core";

/** Tolerance (px) above the bottom edge that still counts as "at the bottom". */
export const JUMP_TOP_OFFSET_PX = 8;

/**
 * Returns the id of the most recent user message across all turn groups, or
 * `null` when there is no user message yet.
 */
export function latestUserItemId(
	groups: readonly TurnGroup[],
): string | null {
	for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
		const group = groups[groupIndex];
		if (!group) continue;
		for (let index = group.entries.length - 1; index >= 0; index -= 1) {
			const entry = group.entries[index];
			if (entry?.kind === "item" && entry.item.kind === "user_message") {
				return entry.item.id;
			}
		}
	}
	return null;
}

export function distanceFromBottom(
	scrollHeight: number,
	scrollTop: number,
	clientHeight: number,
): number {
	return scrollHeight - scrollTop - clientHeight;
}

/** True when the scroll container is pinned at (or within {@link JUMP_TOP_OFFSET_PX} of) its bottom edge. */
export function isNearBottom(
	scrollHeight: number,
	scrollTop: number,
	clientHeight: number,
): boolean {
	return (
		distanceFromBottom(scrollHeight, scrollTop, clientHeight) <=
		JUMP_TOP_OFFSET_PX
	);
}

/**
 * Gating rule for the scroll-pinning effect: only auto-scroll to the latest
 * user reply when we are already near the bottom AND the anchor actually
 * changed since the last time we handled it. The `lastAnchorItemId` guard
 * prevents re-anchoring (yanking the viewport) when the user merely touches
 * the bottom edge — this is the CodeRabbit re-anchor fix from PR #6428.
 */
export function shouldScrollToLatest(args: {
	anchorItemId: string | null;
	lastAnchorItemId: string | null;
	nearBottom: boolean;
}): boolean {
	return (
		args.anchorItemId !== null &&
		args.anchorItemId !== args.lastAnchorItemId &&
		args.nearBottom
	);
}
