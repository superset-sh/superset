import type { WorkspaceState } from "@superset/panes";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "../../v2-workspace/$workspaceId/types";

/**
 * Build a pane layout from terminal descriptors returned by workspace creation.
 * Each terminal becomes its own tab. The renderer just attaches — sessions are
 * already running on the host-service.
 */
export function buildSetupPaneLayout(
	terminals: Array<{ id: string; role: string; label: string }>,
): WorkspaceState<PaneViewerData> {
	const tabs = terminals.map((t) => {
		const paneId = `pane-${crypto.randomUUID()}`;
		const tabId = `tab-${crypto.randomUUID()}`;
		return {
			id: tabId,
			titleOverride: t.label,
			createdAt: Date.now(),
			activePaneId: paneId,
			layout: { type: "pane" as const, paneId },
			panes: {
				[paneId]: {
					id: paneId,
					kind: "terminal",
					data: { terminalId: t.id } as TerminalPaneData,
				},
			},
		};
	});

	return {
		version: 1,
		activeTabId: tabs[0]?.id ?? null,
		tabs,
	};
}
