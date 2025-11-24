import type { MosaicNode } from "react-mosaic-component";

/**
 * Extract all tab IDs from a mosaic layout tree
 */
export function extractTabIdsFromLayout(
	layout: MosaicNode<string> | null,
): Set<string> {
	const ids = new Set<string>();
	if (!layout) return ids;

	if (typeof layout === "string") {
		ids.add(layout);
	} else {
		const firstIds = extractTabIdsFromLayout(layout.first);
		const secondIds = extractTabIdsFromLayout(layout.second);
		for (const id of firstIds) ids.add(id);
		for (const id of secondIds) ids.add(id);
	}

	return ids;
}

/**
 * Remove a tab ID from a mosaic layout tree
 */
export function removeTabFromLayout(
	layout: MosaicNode<string> | null,
	tabIdToRemove: string,
): MosaicNode<string> | null {
	if (!layout) return null;

	if (typeof layout === "string") {
		return layout === tabIdToRemove ? null : layout;
	}

	const newFirst = removeTabFromLayout(layout.first, tabIdToRemove);
	const newSecond = removeTabFromLayout(layout.second, tabIdToRemove);

	if (!newFirst && !newSecond) return null;
	if (!newFirst) return newSecond;
	if (!newSecond) return newFirst;

	return {
		...layout,
		first: newFirst,
		second: newSecond,
	};
}
