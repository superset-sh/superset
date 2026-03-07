import { useCallback, useRef, useState } from "react";
import type { TerminalExitReason } from "../types";
import {
	createInitialTerminalSessionState,
	reduceTerminalSessionState,
	type TerminalExitStatus,
	type TerminalSessionPhase,
	type TerminalSessionState,
} from "./terminalSessionState";

export interface TerminalSessionController {
	connectionError: string | null;
	connectionErrorRef: React.MutableRefObject<string | null>;
	exitStatus: TerminalExitStatus;
	hasReceivedStreamDataSinceAttachRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	isRestoredMode: boolean;
	isRestoredModeRef: React.MutableRefObject<boolean>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	phase: TerminalSessionPhase;
	restoredCwd: string | null;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	beginAttach: () => void;
	enterRestoredMode: (cwd: string | null) => void;
	exitRestoredMode: () => void;
	recordExit: (reason?: TerminalExitReason) => void;
	recordStreamDataReceived: () => void;
	setConnectionError: (error: string | null) => void;
	setRestoredCwd: (cwd: string | null) => void;
	setStreamReady: (ready: boolean) => void;
}

function syncRefsFromState(
	state: TerminalSessionState,
	refs: {
		connectionErrorRef: React.MutableRefObject<string | null>;
		hasReceivedStreamDataSinceAttachRef: React.MutableRefObject<boolean>;
		isExitedRef: React.MutableRefObject<boolean>;
		isRestoredModeRef: React.MutableRefObject<boolean>;
		isStreamReadyRef: React.MutableRefObject<boolean>;
		wasKilledByUserRef: React.MutableRefObject<boolean>;
	},
): void {
	refs.connectionErrorRef.current = state.connectionError;
	refs.hasReceivedStreamDataSinceAttachRef.current =
		state.hasReceivedStreamDataSinceAttach;
	refs.isExitedRef.current = state.isExited;
	refs.isRestoredModeRef.current = state.isRestoredMode;
	refs.isStreamReadyRef.current = state.isStreamReady;
	refs.wasKilledByUserRef.current = state.wasKilledByUser;
}

export function useTerminalSessionController(): TerminalSessionController {
	const connectionErrorRef = useRef<string | null>(null);
	const hasReceivedStreamDataSinceAttachRef = useRef(false);
	const isExitedRef = useRef(false);
	const isRestoredModeRef = useRef(false);
	const isStreamReadyRef = useRef(false);
	const wasKilledByUserRef = useRef(false);

	const [state, setState] = useState(() => {
		const initialState = createInitialTerminalSessionState();
		syncRefsFromState(initialState, {
			connectionErrorRef,
			hasReceivedStreamDataSinceAttachRef,
			isExitedRef,
			isRestoredModeRef,
			isStreamReadyRef,
			wasKilledByUserRef,
		});
		return initialState;
	});

	const applyEvent = useCallback(
		(event: Parameters<typeof reduceTerminalSessionState>[1]) => {
			setState((currentState) => {
				const nextState = reduceTerminalSessionState(currentState, event);
				syncRefsFromState(nextState, {
					connectionErrorRef,
					hasReceivedStreamDataSinceAttachRef,
					isExitedRef,
					isRestoredModeRef,
					isStreamReadyRef,
					wasKilledByUserRef,
				});
				return nextState;
			});
		},
		[],
	);

	const beginAttach = useCallback(() => {
		applyEvent({ type: "ATTACH_STARTED" });
	}, [applyEvent]);

	const setStreamReady = useCallback(
		(ready: boolean) => {
			applyEvent({ type: "STREAM_READY_CHANGED", ready });
		},
		[applyEvent],
	);

	const recordStreamDataReceived = useCallback(() => {
		applyEvent({ type: "STREAM_DATA_RECEIVED" });
	}, [applyEvent]);

	const recordExit = useCallback(
		(reason?: TerminalExitReason) => {
			applyEvent({ type: "EXIT_RECORDED", reason });
		},
		[applyEvent],
	);

	const setConnectionError = useCallback(
		(error: string | null) => {
			applyEvent({ type: "CONNECTION_ERROR_CHANGED", error });
		},
		[applyEvent],
	);

	const enterRestoredMode = useCallback(
		(cwd: string | null) => {
			applyEvent({ type: "RESTORED_MODE_ENTERED", cwd });
		},
		[applyEvent],
	);

	const exitRestoredMode = useCallback(() => {
		applyEvent({ type: "RESTORED_MODE_EXITED" });
	}, [applyEvent]);

	const setRestoredCwd = useCallback(
		(cwd: string | null) => {
			applyEvent({ type: "RESTORED_CWD_CHANGED", cwd });
		},
		[applyEvent],
	);

	return {
		connectionError: state.connectionError,
		connectionErrorRef,
		exitStatus: state.exitStatus,
		hasReceivedStreamDataSinceAttachRef,
		isExitedRef,
		isRestoredMode: state.isRestoredMode,
		isRestoredModeRef,
		isStreamReadyRef,
		phase: state.phase,
		restoredCwd: state.restoredCwd,
		wasKilledByUserRef,
		beginAttach,
		enterRestoredMode,
		exitRestoredMode,
		recordExit,
		recordStreamDataReceived,
		setConnectionError,
		setRestoredCwd,
		setStreamReady,
	};
}
