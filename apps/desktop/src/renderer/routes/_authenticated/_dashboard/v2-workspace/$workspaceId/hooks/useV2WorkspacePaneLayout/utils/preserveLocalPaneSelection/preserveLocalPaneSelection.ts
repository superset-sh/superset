import type { LayoutNode, WorkspaceState } from "@superset/panes";

function getPaneOrder(layout: LayoutNode): string[] {
	if (layout.type === "pane") return [layout.paneId];
	return [...getPaneOrder(layout.first), ...getPaneOrder(layout.second)];
}

function resolveLocalSelection(
	previousOrder: string[],
	previousActiveId: string | null,
	nextOrder: string[],
	nextFallbackId: string | null,
): string | null {
	const survivors = new Set(nextOrder);
	if (previousActiveId && survivors.has(previousActiveId)) {
		return previousActiveId;
	}

	const previousIndex = previousActiveId
		? previousOrder.indexOf(previousActiveId)
		: -1;
	if (previousIndex !== -1) {
		return (
			previousOrder.slice(previousIndex + 1).find((id) => survivors.has(id)) ??
			previousOrder
				.slice(0, previousIndex)
				.reverse()
				.find((id) => survivors.has(id)) ??
			(nextFallbackId && survivors.has(nextFallbackId)
				? nextFallbackId
				: (nextOrder[0] ?? null))
		);
	}

	return nextFallbackId && survivors.has(nextFallbackId)
		? nextFallbackId
		: (nextOrder[0] ?? null);
}

/**
 * Applies a shared pane-layout update without adopting another window's
 * active tab or pane. Selections that still exist remain local; when a remote
 * structural edit removes one, the nearest surviving local sibling wins.
 */
export function preserveLocalPaneSelection<TData>(
	previous: WorkspaceState<TData>,
	next: WorkspaceState<TData>,
): WorkspaceState<TData> {
	const previousTabs = new Map(previous.tabs.map((tab) => [tab.id, tab]));
	const tabs = next.tabs.map((tab) => {
		const previousTab = previousTabs.get(tab.id);
		if (!previousTab) return tab;

		return {
			...tab,
			activePaneId: resolveLocalSelection(
				getPaneOrder(previousTab.layout),
				previousTab.activePaneId,
				getPaneOrder(tab.layout),
				tab.activePaneId,
			),
		};
	});

	return {
		...next,
		tabs,
		activeTabId: resolveLocalSelection(
			previous.tabs.map((tab) => tab.id),
			previous.activeTabId,
			tabs.map((tab) => tab.id),
			next.activeTabId,
		),
	};
}

/** Active selections are window-local and must not participate in sync. */
export function getSharedPaneLayoutSnapshot<TData>(
	state: WorkspaceState<TData>,
): string {
	return JSON.stringify({
		...state,
		activeTabId: null,
		tabs: state.tabs.map((tab) => ({ ...tab, activePaneId: null })),
	});
}
