import type { Pane, Tab } from "../../../../types";
import type { PaneRegistry } from "../../../types";

/**
 * The pane that drives the tab title: the only pane (single-pane tab) or
 * the active pane (multi-pane tab). Undefined for empty tabs or stale
 * activePaneId references.
 */
export function pickTabTitlePane<TData>(
	tab: Tab<TData>,
): Pane<TData> | undefined {
	const panes = Object.values(tab.panes);
	if (panes.length === 1) return panes[0];
	if (panes.length > 1 && tab.activePaneId) return tab.panes[tab.activePaneId];
	return undefined;
}

function paneTitle<TData>(
	pane: Pane<TData> | undefined,
	registry: PaneRegistry<TData>,
): string | undefined {
	if (!pane) return undefined;
	return pane.titleOverride ?? registry[pane.kind]?.getTitle?.(pane);
}

export function resolveTabTitle<TData>(
	tab: Tab<TData>,
	tabs: Tab<TData>[],
	registry: PaneRegistry<TData>,
): string {
	if (tab.titleOverride) return tab.titleOverride;
	const fromPane = paneTitle(pickTabTitlePane(tab), registry);
	if (fromPane) return fromPane;
	return `Tab ${tabs.indexOf(tab) + 1}`;
}
