import { toast } from "@superset/ui/sonner";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { DEBUG_TERMINAL } from "../config";
import type { TerminalExitReason, TerminalStreamEvent } from "../types";

/** Max bytes to buffer for a hidden terminal before flushing directly to xterm */
const MAX_BACKGROUND_BUFFER_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UseTerminalStreamOptions {
	paneId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	isTabActiveRef: React.MutableRefObject<boolean>;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	setConnectionError: (error: string | null) => void;
	updateModesFromData: (data: string) => void;
	updateCwdFromData: (data: string) => void;
}

export interface UseTerminalStreamReturn {
	handleTerminalExit: (
		exitCode: number,
		xterm: XTerm,
		reason?: TerminalExitReason,
	) => void;
	handleStreamError: (
		event: Extract<TerminalStreamEvent, { type: "error" }>,
		xterm: XTerm,
	) => void;
	handleStreamData: (event: TerminalStreamEvent) => void;
	flushBackgroundBuffer: () => void;
}

/**
 * Hook to handle terminal stream events (data, exit, disconnect, error).
 *
 * When the terminal's tab is not active (`isTabActiveRef.current === false`),
 * incoming data events are buffered instead of written to xterm. This avoids
 * wasting GPU cycles rendering to a hidden WebGL canvas. The buffer is flushed
 * either when the tab becomes visible (via `flushBackgroundBuffer`) or inline
 * when the next data event arrives after the tab is activated.
 */
export function useTerminalStream({
	paneId,
	xtermRef,
	isStreamReadyRef,
	isExitedRef,
	wasKilledByUserRef,
	pendingEventsRef,
	isTabActiveRef,
	setExitStatus,
	setConnectionError,
	updateModesFromData,
	updateCwdFromData,
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);
	const firstStreamDataReceivedRef = useRef(false);

	// Background buffer for data received while the tab is hidden
	const backgroundBufferRef = useRef<string[]>([]);
	const backgroundBufferBytesRef = useRef(0);

	// Refs to use latest values in callbacks
	const updateModesRef = useRef(updateModesFromData);
	updateModesRef.current = updateModesFromData;
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;

	const flushBackgroundBuffer = useCallback(() => {
		const xterm = xtermRef.current;
		if (!xterm || backgroundBufferRef.current.length === 0) return;

		const data = backgroundBufferRef.current.join("");
		backgroundBufferRef.current = [];
		backgroundBufferBytesRef.current = 0;

		// Modes and CWD were already tracked per-event during buffering,
		// so only the xterm write is needed here.
		xterm.write(data);

		if (DEBUG_TERMINAL) {
			console.log(
				`[Terminal] Flushed background buffer: ${paneId}, ${data.length} bytes`,
			);
		}
	}, [paneId, xtermRef]);

	const handleTerminalExit = useCallback(
		(exitCode: number, xterm: XTerm, reason?: TerminalExitReason) => {
			isExitedRef.current = true;
			isStreamReadyRef.current = false;

			const wasKilledByUser = reason === "killed";
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

			// Queue ALL events until terminal is ready, preserving order
			// flushPendingEvents will process them in sequence after restore
			if (!xterm || !isStreamReadyRef.current) {
				if (DEBUG_TERMINAL && event.type === "data") {
					console.log(
						`[Terminal] Queuing event (not ready): ${paneId}, type=${event.type}, bytes=${event.data.length}`,
					);
				}
				pendingEventsRef.current.push(event);
				return;
			}

			// Process events when stream is ready
			if (event.type === "data") {
				if (DEBUG_TERMINAL && !firstStreamDataReceivedRef.current) {
					firstStreamDataReceivedRef.current = true;
					console.log(
						`[Terminal] First stream data received: ${paneId}, ${event.data.length} bytes`,
					);
				}

				// When tab is hidden, buffer data to avoid wasting GPU on hidden canvas.
				// Modes and CWD are still tracked so state stays consistent.
				if (!isTabActiveRef.current) {
					updateModesRef.current(event.data);
					updateCwdRef.current(event.data);

					backgroundBufferRef.current.push(event.data);
					backgroundBufferBytesRef.current += event.data.length;

					// On overflow, flush buffer to xterm to prevent unbounded memory growth.
					// This is a graceful degradation — hidden xterm still processes writes correctly.
					if (backgroundBufferBytesRef.current > MAX_BACKGROUND_BUFFER_BYTES) {
						const buffered = backgroundBufferRef.current.join("");
						backgroundBufferRef.current = [];
						backgroundBufferBytesRef.current = 0;
						xterm.write(buffered);
					}
					return;
				}

				// Tab is visible — flush any buffered data before writing new data
				if (backgroundBufferRef.current.length > 0) {
					const buffered = backgroundBufferRef.current.join("");
					backgroundBufferRef.current = [];
					backgroundBufferBytesRef.current = 0;
					xterm.write(buffered);
				}

				updateModesRef.current(event.data);
				xterm.write(event.data);
				updateCwdRef.current(event.data);
			} else if (event.type === "exit") {
				handleTerminalExit(event.exitCode, xterm, event.reason);
			} else if (event.type === "disconnect") {
				setConnectionError(
					event.reason || "Connection to terminal daemon lost",
				);
			} else if (event.type === "error") {
				handleStreamError(event, xterm);
			}
		},
		[
			paneId,
			xtermRef,
			isStreamReadyRef,
			isTabActiveRef,
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
		flushBackgroundBuffer,
	};
}
