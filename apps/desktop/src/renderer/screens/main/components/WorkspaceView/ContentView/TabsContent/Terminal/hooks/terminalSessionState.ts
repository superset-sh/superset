import type { TerminalExitReason } from "../types";

export type TerminalExitStatus = "killed" | "exited" | null;

export type TerminalSessionPhase =
	| "mounting"
	| "attaching"
	| "restored"
	| "live"
	| "exited"
	| "killed"
	| "connection_error";

export interface TerminalSessionState {
	phase: TerminalSessionPhase;
	exitStatus: TerminalExitStatus;
	connectionError: string | null;
	isRestoredMode: boolean;
	restoredCwd: string | null;
	isStreamReady: boolean;
	isExited: boolean;
	wasKilledByUser: boolean;
	hasReceivedStreamDataSinceAttach: boolean;
}

export type TerminalSessionEvent =
	| { type: "SESSION_MOUNTED" }
	| { type: "ATTACH_STARTED" }
	| { type: "STREAM_READY_CHANGED"; ready: boolean }
	| { type: "STREAM_DATA_RECEIVED" }
	| { type: "EXIT_RECORDED"; reason?: TerminalExitReason }
	| { type: "CONNECTION_ERROR_CHANGED"; error: string | null }
	| { type: "RESTORED_MODE_ENTERED"; cwd: string | null }
	| { type: "RESTORED_MODE_EXITED" }
	| { type: "RESTORED_CWD_CHANGED"; cwd: string | null };

export const createInitialTerminalSessionState = (): TerminalSessionState => ({
	phase: "mounting",
	exitStatus: null,
	connectionError: null,
	isRestoredMode: false,
	restoredCwd: null,
	isStreamReady: false,
	isExited: false,
	wasKilledByUser: false,
	hasReceivedStreamDataSinceAttach: false,
});

function derivePhase(
	state: Omit<TerminalSessionState, "phase">,
): TerminalSessionPhase {
	if (state.connectionError) return "connection_error";
	if (state.isRestoredMode) return "restored";
	if (state.wasKilledByUser || state.exitStatus === "killed") return "killed";
	if (state.isExited || state.exitStatus === "exited") return "exited";
	if (state.isStreamReady) return "live";
	return "attaching";
}

function withDerivedPhase(
	state: Omit<TerminalSessionState, "phase">,
): TerminalSessionState {
	return {
		...state,
		phase: derivePhase(state),
	};
}

export function reduceTerminalSessionState(
	state: TerminalSessionState,
	event: TerminalSessionEvent,
): TerminalSessionState {
	switch (event.type) {
		case "SESSION_MOUNTED":
		case "ATTACH_STARTED":
			return withDerivedPhase({
				...state,
				exitStatus: null,
				connectionError: null,
				isRestoredMode: false,
				restoredCwd: null,
				isStreamReady: false,
				isExited: false,
				wasKilledByUser: false,
				hasReceivedStreamDataSinceAttach: false,
			});
		case "STREAM_READY_CHANGED":
			return withDerivedPhase({
				...state,
				isStreamReady: event.ready,
			});
		case "STREAM_DATA_RECEIVED":
			return withDerivedPhase({
				...state,
				hasReceivedStreamDataSinceAttach: true,
			});
		case "EXIT_RECORDED": {
			const wasKilledByUser = event.reason === "killed";
			return withDerivedPhase({
				...state,
				exitStatus: wasKilledByUser ? "killed" : "exited",
				isExited: true,
				isStreamReady: false,
				wasKilledByUser,
			});
		}
		case "CONNECTION_ERROR_CHANGED":
			return withDerivedPhase({
				...state,
				connectionError: event.error,
			});
		case "RESTORED_MODE_ENTERED":
			return withDerivedPhase({
				...state,
				isRestoredMode: true,
				restoredCwd: event.cwd,
				exitStatus: null,
				connectionError: null,
				isExited: false,
				wasKilledByUser: false,
			});
		case "RESTORED_MODE_EXITED":
			return withDerivedPhase({
				...state,
				isRestoredMode: false,
				restoredCwd: null,
			});
		case "RESTORED_CWD_CHANGED":
			return withDerivedPhase({
				...state,
				restoredCwd: event.cwd,
			});
	}
}
