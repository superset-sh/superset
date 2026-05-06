import type { Pane, Tab } from "../../../../types";
import type { PaneRegistry } from "../../../types";

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
	const panes = Object.values(tab.panes);
	if (panes.length === 1) {
		const fromOnlyPane = paneTitle(panes[0], registry);
		if (fromOnlyPane) return fromOnlyPane;
	} else if (panes.length > 1) {
		const activePane = tab.activePaneId
			? tab.panes[tab.activePaneId]
			: undefined;
		const fromActivePane = paneTitle(activePane, registry);
		if (fromActivePane) return fromActivePane;
	}
	return `Tab ${tabs.indexOf(tab) + 1}`;
}
