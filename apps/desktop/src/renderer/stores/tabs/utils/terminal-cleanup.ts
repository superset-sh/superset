import { trpcClient } from "../../../lib/trpc-client";

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 */
export const killTerminalForTab = (tabId: string): void => {
	trpcClient.terminal.kill.mutate({ tabId }).catch((error) => {
		console.warn(`Failed to kill terminal for tab ${tabId}:`, error);
	});
};
