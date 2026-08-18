import type { WorkspaceProps } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import {
	confirmCloseTerminals,
	probeTerminalRunning,
} from "renderer/lib/terminal/confirm-close-terminals";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import { useDirtyTabCloseGuard } from "../useDirtyTabCloseGuard";

type OnBeforeCloseTab = NonNullable<
	WorkspaceProps<PaneViewerData>["onBeforeCloseTab"]
>;

/**
 * Tab-close guard composing the running-terminal confirm with the dirty-file
 * confirm. Closing a tab runs both so a running process can't be killed without
 * a prompt via the tab-close gesture (the per-pane onBeforeClose never fires on
 * tab close). Terminals are checked first, then unsaved files.
 */
export function useTabCloseGuard(): OnBeforeCloseTab {
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const utils = workspaceTrpc.useUtils();
	const dirtyGuard = useDirtyTabCloseGuard();

	return useCallback<OnBeforeCloseTab>(
		async (tab) => {
			const terminalIds = Object.values(tab.panes)
				.filter((pane) => pane.kind === "terminal")
				.map((pane) => (pane.data as TerminalPaneData).terminalId);

			const allowed = await confirmCloseTerminals(
				terminalIds,
				(id) => probeTerminalRunning(utils, workspaceId, id),
				{
					title: "A process is still running in this tab",
					description: "Closing this tab will end the running process.",
					confirmLabel: "Close tab",
				},
			);
			if (!allowed) return false;

			return dirtyGuard(tab);
		},
		[utils, workspaceId, dirtyGuard],
	);
}
