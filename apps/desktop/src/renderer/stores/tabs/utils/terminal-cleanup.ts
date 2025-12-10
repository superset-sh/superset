import { trpcClient } from "../../../lib/trpc-client";

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 * Permanently deletes terminal history when killing the terminal
 */
export const killTerminalForPane = (paneId: string): void => {
	trpcClient.terminal.kill
		.mutate({ paneId, deleteHistory: true })
		.catch((error) => {
			console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
		});
};
