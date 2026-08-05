import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	navigateToWorkspace as navigateToV1Workspace,
	navigateToV2Workspace,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SessionMetrics } from "../../types";

interface UseResourceNavigationOptions {
	surface: "v1" | "v2";
	/** Called after navigating, e.g. to close the popover or palette. */
	onNavigate: () => void;
}

/**
 * Navigation targets for resource rows: open a workspace, or jump straight
 * to the pane a terminal session lives in. Also resolves display names for
 * v1 sessions from the panes store.
 */
export function useResourceNavigation({
	surface,
	onNavigate,
}: UseResourceNavigationOptions) {
	const navigate = useNavigate();
	const panes = useTabsStore((state) => state.panes);
	const setActiveTab = useTabsStore((state) => state.setActiveTab);
	const setFocusedPane = useTabsStore((state) => state.setFocusedPane);
	const isV2 = surface === "v2";

	const getPaneName = useCallback(
		(session: SessionMetrics): string => {
			if (isV2) {
				return session.title ?? `Terminal ${session.sessionId.slice(0, 8)}`;
			}
			const pane = panes[session.paneId];
			return pane?.name || `Pane ${session.paneId.slice(0, 6)}`;
		},
		[isV2, panes],
	);

	const navigateToWorkspace = useCallback(
		(workspaceId: string) => {
			if (isV2) {
				void navigateToV2Workspace(workspaceId, navigate);
			} else {
				void navigateToV1Workspace(workspaceId, navigate);
			}
			onNavigate();
		},
		[isV2, navigate, onNavigate],
	);

	const navigateToPane = useCallback(
		(workspaceId: string, paneId: string) => {
			if (isV2) {
				void navigateToV2Workspace(workspaceId, navigate, {
					search: {
						terminalId: paneId,
						focusRequestId: crypto.randomUUID(),
					},
				});
				onNavigate();
				return;
			}

			const pane = panes[paneId];
			if (pane) {
				setActiveTab(workspaceId, pane.tabId);
				setFocusedPane(pane.tabId, paneId);
			}
			void navigateToV1Workspace(workspaceId, navigate);
			onNavigate();
		},
		[isV2, navigate, onNavigate, panes, setActiveTab, setFocusedPane],
	);

	return { getPaneName, navigateToWorkspace, navigateToPane };
}
