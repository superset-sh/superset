import type { TabsState } from "../types";

/**
 * Pure reorder of a workspace's tabs within the global tabs array.
 *
 * Returns the SAME array reference when the move is a no-op or the indices are
 * invalid, so callers can skip a state update (and the resulting re-render).
 */
export function reorderTabsInState(
	tabs: TabsState["tabs"],
	workspaceId: string,
	startIndex: number,
	endIndex: number,
): TabsState["tabs"] {
	const workspaceTabs = tabs.filter((t) => t.workspaceId === workspaceId);
	const otherTabs = tabs.filter((t) => t.workspaceId !== workspaceId);

	// Prevent corrupting state by splicing undefined elements
	if (
		startIndex < 0 ||
		startIndex >= workspaceTabs.length ||
		!Number.isInteger(startIndex)
	) {
		return tabs;
	}

	// Prevent out-of-bounds writes that would insert undefined elements
	const clampedEndIndex = Math.max(0, Math.min(endIndex, workspaceTabs.length));
	if (clampedEndIndex === startIndex) {
		return tabs;
	}

	// Avoid mutating original state array to prevent side effects elsewhere
	const reorderedTabs = [...workspaceTabs];
	const [removed] = reorderedTabs.splice(startIndex, 1);
	reorderedTabs.splice(clampedEndIndex, 0, removed);

	return [...otherTabs, ...reorderedTabs];
}
