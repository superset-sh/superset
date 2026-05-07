import { useCallback, useSyncExternalStore } from "react";
import type { Pane, Tab } from "../../../../types";
import type { PaneRegistry } from "../../../types";
import { resolveTabTitle } from "./resolveTabTitle";

const noopUnsubscribe = () => {};
const undefinedSnapshot = () => undefined;

/**
 * Subscribe to a pane's runtime-driven title via its registry definition.
 * Always calls a single useSyncExternalStore, so kind changes don't break
 * the rules of hooks. Returns the live title or undefined if no source.
 */
function useReactivePaneTitle<TData>(
	pane: Pane<TData> | undefined,
	registry: PaneRegistry<TData>,
): string | undefined {
	const subscribe = useCallback(
		(callback: () => void) => {
			if (!pane) return noopUnsubscribe;
			const source = registry[pane.kind]?.titleSource?.(pane);
			return source?.subscribe(callback) ?? noopUnsubscribe;
		},
		[pane, registry],
	);
	const getSnapshot = useCallback(() => {
		if (!pane) return undefined;
		const source = registry[pane.kind]?.titleSource?.(pane);
		return source?.getSnapshot();
	}, [pane, registry]);
	return useSyncExternalStore(subscribe, getSnapshot, undefinedSnapshot);
}

function pickTitlePane<TData>(tab: Tab<TData>): Pane<TData> | undefined {
	const panes = Object.values(tab.panes);
	if (panes.length === 1) return panes[0];
	if (panes.length > 1 && tab.activePaneId) return tab.panes[tab.activePaneId];
	return undefined;
}

/**
 * Reactive tab title. Same precedence as `resolveTabTitle`, plus a runtime
 * title source layered between `pane.titleOverride` and `registry.getTitle`.
 *
 * Precedence:
 *   tab.titleOverride
 *   pane.titleOverride
 *   pane titleSource (live)
 *   registry.getTitle(pane)
 *   "Tab N"
 */
export function useTabTitle<TData>(
	tab: Tab<TData>,
	tabs: Tab<TData>[],
	registry: PaneRegistry<TData>,
): string {
	const titlePane = pickTitlePane(tab);
	const reactiveTitle = useReactivePaneTitle(titlePane, registry);

	if (tab.titleOverride) return tab.titleOverride;
	if (titlePane?.titleOverride) return titlePane.titleOverride;
	const trimmed = reactiveTitle?.trim();
	if (trimmed) return trimmed;
	return resolveTabTitle(tab, tabs, registry);
}
