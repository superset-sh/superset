import type { Pane, PaneRegistry } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../types";

/**
 * Human-readable label for a pane, for the MRU switcher overlay.
 *
 * `registry[kind].getTitle()` alone is not enough. The chat definition
 * returns the constant "Chat" and the terminal definition returns the
 * constant "Terminal" — their real titles arrive through a `renderTitle`
 * React component and a runtime `titleSource` respectively. Labelling every
 * chat pane "Chat" would defeat the point of the switcher, which exists so
 * you can tell two agent sessions apart.
 *
 * Resolution order, first hit wins:
 *   1. an explicit user rename on the pane (`titleOverride`)
 *   2. the reactive runtime title (`titleSource`), which is where a
 *      terminal's current process/cwd title lives
 *   3. the chat session's title, looked up by the pane's `sessionId`
 *   4. the registry's static `getTitle`
 *   5. the pane kind, so the label is never empty
 */
export function resolvePaneLabel({
	pane,
	registry,
	chatTitlesBySessionId,
}: {
	pane: Pane<PaneViewerData>;
	registry: PaneRegistry<PaneViewerData>;
	chatTitlesBySessionId: Map<string, string>;
}): string {
	const override = pane.titleOverride?.trim();
	if (override) return override;

	const definition = registry[pane.kind];

	const runtimeTitle = definition?.titleSource?.(pane)?.getSnapshot()?.trim();
	if (runtimeTitle) return runtimeTitle;

	if (pane.kind === "chat") {
		const { sessionId } = pane.data as ChatPaneData;
		const sessionTitle = sessionId
			? chatTitlesBySessionId.get(sessionId)?.trim()
			: undefined;
		if (sessionTitle) return sessionTitle;
	}

	const staticTitle = definition?.getTitle?.(pane)?.trim();
	if (staticTitle) return staticTitle;

	return pane.kind;
}
