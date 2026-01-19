import { toast } from "@superset/ui/sonner";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { isTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { useTabsStore } from "renderer/stores/tabs/store";
import { DEBUG_TERMINAL } from "../config";
import type { TerminalStreamEvent } from "../types";

export interface UseTerminalStreamOptions {
	paneId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	setConnectionError: (error: string | null) => void;
	updateModesFromData: (data: string) => void;
	updateCwdFromData: (data: string) => void;
}

export interface UseTerminalStreamReturn {
	handleTerminalExit: (exitCode: number, xterm: XTerm) => void;
	handleStreamError: (
		event: Extract<TerminalStreamEvent, { type: "error" }>,
		xterm: XTerm,
	) => void;
	handleStreamData: (event: TerminalStreamEvent) => void;
}

/**
 * Hook to handle terminal stream events (data, exit, disconnect, error).
 */
export function useTerminalStream({
	paneId,
	xtermRef,
	isStreamReadyRef,
	isExitedRef,
	wasKilledByUserRef,
	pendingEventsRef,
	setExitStatus,
	setConnectionError,
	updateModesFromData,
	updateCwdFromData,
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);
	const firstStreamDataReceivedRef = useRef(false);

	// Refs to use latest values in callbacks
	const updateModesRef = useRef(updateModesFromData);
	updateModesRef.current = updateModesFromData;
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;

	const handleTerminalExit = useCallback(
		(exitCode: number, xterm: XTerm) => {
			isExitedRef.current = true;
			isStreamReadyRef.current = false;

			const wasKilledByUser = isTerminalKilledByUser(paneId);
			wasKilledByUserRef.current = wasKilledByUser;
			setExitStatus(wasKilledByUser ? "killed" : "exited");

			if (wasKilledByUser) {
				xterm.writeln("\r\n\r\n[Session killed]");
				xterm.writeln("[Restart to start a new session]");
			} else {
				xterm.writeln(`\r\n\r\n[Process exited with code ${exitCode}]`);
				xterm.writeln("[Press any key to restart]");
			}

			// Clear transient pane status on terminal exit
			const currentPane = useTabsStore.getState().panes[paneId];
			if (
				currentPane?.status === "working" ||
				currentPane?.status === "permission"
			) {
				setPaneStatus(paneId, "idle");
			}
		},
		[
			paneId,
			isExitedRef,
			isStreamReadyRef,
			wasKilledByUserRef,
			setExitStatus,
			setPaneStatus,
		],
	);

	const handleStreamError = useCallback(
		(event: Extract<TerminalStreamEvent, { type: "error" }>, xterm: XTerm) => {
			const message = event.code
				? `${event.code}: ${event.error}`
				: event.error;
			console.warn("[Terminal] stream error:", message);

			if (
				event.code === "WRITE_FAILED" &&
				event.error?.includes("Session not found")
			) {
				setConnectionError("Session lost - click to reconnect");
				return;
			}

			if (
				event.code === "WRITE_FAILED" &&
				event.error?.includes("PTY not spawned")
			) {
				xterm.writeln(`\r\n[Terminal] ${message}`);
				return;
			}

			toast.error("Terminal error", { description: message });

			if (event.code === "WRITE_QUEUE_FULL" || event.code === "WRITE_FAILED") {
				xterm.writeln(`\r\n[Terminal] ${message}`);
			} else {
				setConnectionError(message);
			}
		},
		[setConnectionError],
	);

	const handleStreamData = useCallback(
		(event: TerminalStreamEvent) => {
			const xterm = xtermRef.current;

			// Handle critical events (exit, disconnect, error) immediately if xterm exists
			// These should not be queued as they represent important state changes
			if (event.type === "exit") {
				if (xterm) {
					handleTerminalExit(event.exitCode, xterm);
				} else {
					// Queue if xterm doesn't exist yet - will be processed when flushed
					pendingEventsRef.current.push(event);
				}
				return;
			}

			if (event.type === "disconnect") {
				// Disconnect doesn't need xterm - can always handle immediately
				setConnectionError(
					event.reason || "Connection to terminal daemon lost",
				);
				return;
			}

			if (event.type === "error") {
				if (xterm) {
					handleStreamError(event, xterm);
				} else {
					// Queue if xterm doesn't exist yet - will be processed when flushed
					pendingEventsRef.current.push(event);
				}
				return;
			}

			// Queue data events until terminal is ready
			if (!xterm || !isStreamReadyRef.current) {
				if (DEBUG_TERMINAL) {
					console.log(
						`[Terminal] Queuing event (not ready): ${paneId}, type=${event.type}, bytes=${event.data.length}`,
					);
				}
				pendingEventsRef.current.push(event);
				return;
			}

			if (DEBUG_TERMINAL && !firstStreamDataReceivedRef.current) {
				firstStreamDataReceivedRef.current = true;
				console.log(
					`[Terminal] First stream data received: ${paneId}, ${event.data.length} bytes`,
				);
			}
			updateModesRef.current(event.data);
			xterm.write(event.data);
			updateCwdRef.current(event.data);
		},
		[
			paneId,
			xtermRef,
			isStreamReadyRef,
			pendingEventsRef,
			handleTerminalExit,
			handleStreamError,
			setConnectionError,
		],
	);

	return {
		handleTerminalExit,
		handleStreamError,
		handleStreamData,
	};
}
