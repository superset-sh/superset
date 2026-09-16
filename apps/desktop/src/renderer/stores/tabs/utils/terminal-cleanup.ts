import { isTerminalDebugEnabled } from "../../../lib/terminal/debug";
import { rejectTerminalSessionReady } from "../../../lib/terminal/session-readiness";
import { electronTrpcClient } from "../../../lib/trpc-client";

/**
 * Why a pane's terminal session is being killed. Every destructive path routes
 * through here, so the reason is the only record of *which* one ran — without
 * it a pane that dies seconds after it was created is indistinguishable in the
 * logs from one the user closed on purpose, which is why panes disappearing
 * mid-launch has gone undiagnosed since April 2026.
 */
export type TerminalKillReason =
	| "remove-pane"
	| "remove-tab"
	| "update-tab-layout"
	| "pane-destroyed-on-unmount";

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 */
export const killTerminalForPane = (
	paneId: string,
	reason: TerminalKillReason,
): void => {
	if (isTerminalDebugEnabled()) {
		console.log(`[terminal] killing pane ${paneId} (${reason})`);
		console.trace(`[terminal] kill origin for ${paneId}`);
	}

	rejectTerminalSessionReady(
		paneId,
		new Error("Terminal pane was closed before the session became ready"),
	);
	electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};
