import { trpcClient } from "../../../lib/trpc-client";
import { markTerminalKilledByUser } from "../../../lib/terminal-kill-tracking";

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 */
export const killTerminalForPane = (paneId: string): void => {
	markTerminalKilledByUser(paneId);
	trpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};
