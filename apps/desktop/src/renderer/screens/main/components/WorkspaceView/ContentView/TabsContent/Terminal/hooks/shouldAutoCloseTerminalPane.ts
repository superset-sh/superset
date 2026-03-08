import type { TerminalExitReason } from "../types";

export function shouldAutoCloseTerminalPane(params: {
	exitCode: number;
	reason?: TerminalExitReason;
	hasReceivedStreamDataSinceAttach: boolean;
}): boolean {
	return (
		params.reason !== "killed" &&
		params.exitCode === 0 &&
		params.hasReceivedStreamDataSinceAttach
	);
}
