import type { Pane } from "../../../../../types";
import type { PaneRegistry } from "../../../../types";
export function notifyClosedPanes<TData>(
	panes: readonly Pane<TData>[],
	registry: PaneRegistry<TData>,
): void {
	for (const pane of panes) {
		try {
			registry[pane.kind]?.onAfterClose?.(pane, panes);
		} catch (error) {
			console.error("onAfterClose threw", error);
		}
	}
}
