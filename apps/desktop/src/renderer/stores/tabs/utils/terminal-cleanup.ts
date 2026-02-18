import { electronTrpcClient } from "../../../lib/trpc-client";

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 */
export const killTerminalForPane = (
	paneId: string,
	workspaceId?: string,
): void => {
	electronTrpcClient.terminal.kill
		.mutate({ paneId, workspaceId })
		.catch((error) => {
			console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
		});
};
