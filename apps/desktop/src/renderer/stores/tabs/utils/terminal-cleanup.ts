import { rejectTerminalSessionReady } from "../../../lib/terminal/session-readiness";
import { electronTrpcClient } from "../../../lib/trpc-client";

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 */
export const killTerminalForPane = (paneId: string): void => {
	rejectTerminalSessionReady(
		paneId,
		new Error("Terminal pane was closed before the session became ready"),
	);
	electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};
