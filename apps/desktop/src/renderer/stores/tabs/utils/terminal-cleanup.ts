import { electronTrpcClient } from "../../../lib/trpc-client";
import { clearPaneWorkspaceRunLaunchPending } from "../workspace-run";

/**
 * Uses standalone tRPC client to avoid React hook dependencies.
 * Also cleans up module-level state that can leak if not cleared on pane destroy.
 */
export const killTerminalForPane = (paneId: string): void => {
	clearPaneWorkspaceRunLaunchPending(paneId);
	electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};
