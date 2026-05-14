import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Pane, Tab } from "../../../../types";
import type { PaneRegistry, PaneTitleSource } from "../../../types";
import { pickTabTitlePane } from "./resolveTabTitle";

const noopUnsubscribe = () => {};
const noopSubscribe = () => noopUnsubscribe;
const undefinedSnapshot = () => undefined;

/**
 * Live title from a pane's registry-defined titleSource. Always calls a
 * single useSyncExternalStore so kind changes (active-pane swap, replacePane)
 * don't violate rules of hooks.
 */
function useReactivePaneTitle<TData>(
	pane: Pane<TData> | undefined,
	registry: PaneRegistry<TData>,
): string | undefined {
	const source: PaneTitleSource | undefined = useMemo(
		() => (pane ? registry[pane.kind]?.titleSource?.(pane) : undefined),
		[pane, registry],
	);
	const subscribe = useCallback(
		(callback: () => void) => source?.subscribe(callback) ?? noopUnsubscribe,
		[source],
	);
	const getSnapshot = useCallback(() => source?.getSnapshot(), [source]);
	return useSyncExternalStore(
		source ? subscribe : noopSubscribe,
		source ? getSnapshot : undefinedSnapshot,
	);
}

/**
 * Reactive tab title. Precedence:
 *
 *   tab.titleOverride
 *   pane.titleOverride           (only/active pane)
 *   pane.titleSource (live)      (only/active pane)
 *   registry.getTitle(pane)      (only/active pane)
 *   "Tab N"
 */
export function useTabTitle<TData>(
	tab: Tab<TData>,
	tabs: Tab<TData>[],
	registry: PaneRegistry<TData>,
): string {
	const titlePane = pickTabTitlePane(tab);
	const reactiveTitle = useReactivePaneTitle(titlePane, registry)?.trim();

	if (tab.titleOverride) return tab.titleOverride;
	if (titlePane?.titleOverride) return titlePane.titleOverride;
	if (reactiveTitle) return reactiveTitle;
	const staticTitle = titlePane
		? registry[titlePane.kind]?.getTitle?.(titlePane)
		: undefined;
	if (staticTitle) return staticTitle;
	return `Tab ${tabs.indexOf(tab) + 1}`;
}
