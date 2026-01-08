import { trpcClient } from "../../../lib/trpc-client";
import { removeCachedTerminal } from "../../../screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/terminalCache";

/**
 * Kills the terminal session and cleans up cached terminal instance
 */
export const killTerminalForPane = (paneId: string): void => {
	// Remove cached terminal instance (disposes xterm)
	removeCachedTerminal(paneId);

	// Kill the PTY process on the backend
	trpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};
