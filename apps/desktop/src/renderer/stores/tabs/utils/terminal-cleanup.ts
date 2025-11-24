import { trpcClient } from "../../../lib/trpc-client";

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 * Permanently deletes terminal history when killing the terminal
 */
export const killTerminalForTab = (tabId: string): void => {
	trpcClient.terminal.kill
		.mutate({ tabId, deleteHistory: true })
		.catch((error) => {
			console.warn(`Failed to kill terminal for tab ${tabId}:`, error);
		});
};
