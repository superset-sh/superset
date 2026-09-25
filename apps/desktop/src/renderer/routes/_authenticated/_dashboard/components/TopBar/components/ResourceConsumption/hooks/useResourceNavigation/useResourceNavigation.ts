import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { navigateToWorkspace as navigateToWorkspaceRoute } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { SessionMetrics } from "../../types";

interface UseResourceNavigationOptions {
	/** Called after navigating, e.g. to close the popover or palette. */
	onNavigate: () => void;
}

/**
 * Navigation targets for resource rows: open a workspace, or jump straight
 * to the pane a terminal session lives in.
 */
export function useResourceNavigation({
	onNavigate,
}: UseResourceNavigationOptions) {
	const navigate = useNavigate();

	const getPaneName = useCallback(
		(session: SessionMetrics): string =>
			session.title ?? `Terminal ${session.sessionId.slice(0, 8)}`,
		[],
	);

	const navigateToWorkspace = useCallback(
		(workspaceId: string) => {
			void navigateToWorkspaceRoute(workspaceId, navigate);
			onNavigate();
		},
		[navigate, onNavigate],
	);

	const navigateToPane = useCallback(
		(workspaceId: string, paneId: string) => {
			void navigateToWorkspaceRoute(workspaceId, navigate, {
				search: {
					terminalId: paneId,
					focusRequestId: crypto.randomUUID(),
				},
			});
			onNavigate();
		},
		[navigate, onNavigate],
	);

	return { getPaneName, navigateToWorkspace, navigateToPane };
}
