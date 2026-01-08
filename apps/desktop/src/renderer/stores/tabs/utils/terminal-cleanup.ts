import { trpcClient } from "../../../lib/trpc-client";

/**
 * Kills the terminal session
 */
export const killTerminalForPane = (paneId: string): void => {
	trpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};
