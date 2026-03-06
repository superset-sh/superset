import { toast } from "@superset/ui/sonner";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { DEBUG_TERMINAL } from "../config";
import { matchesSessionGeneration } from "../session-generation";
import type { TerminalExitReason, TerminalStreamEvent } from "../types";

export interface UseTerminalStreamOptions {
	paneId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	activeSessionGenerationRef: React.MutableRefObject<string | null>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	setConnectionError: (error: string | null) => void;
	updateModesFromData: (data: string) => void;
	updateCwdFromData: (data: string) => void;
	onShellExit?: () => void;
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
}

export function useTerminalStream({
	paneId,
	xtermRef,
	activeSessionGenerationRef,
	isStreamReadyRef,
	isExitedRef,
	wasKilledByUserRef,
	pendingEventsRef,
	setExitStatus,
	setConnectionError,
	updateModesFromData,
	updateCwdFromData,
	onShellExit,
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);
	const firstStreamDataReceivedRef = useRef(false);
	const pendingWriteBufferRef = useRef("");
	const pendingWriteGenerationRef = useRef<string | null>(null);
	const isWriteFlushScheduledRef = useRef(false);

	// Refs to use latest values in callbacks
	const updateModesRef = useRef(updateModesFromData);
	updateModesRef.current = updateModesFromData;
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;

	const flushPendingData = useCallback(() => {
		isWriteFlushScheduledRef.current = false;

		const pending = pendingWriteBufferRef.current;
		if (!pending) return;
		if (
			!matchesSessionGeneration(
				activeSessionGenerationRef.current,
				pendingWriteGenerationRef.current ?? undefined,
			)
		) {
			pendingWriteBufferRef.current = "";
			pendingWriteGenerationRef.current = null;
			return;
		}

		const activeTerminal = xtermRef.current;
		if (!activeTerminal || !isStreamReadyRef.current) return;

		pendingWriteBufferRef.current = "";
		pendingWriteGenerationRef.current = null;
		updateModesRef.current(pending);
		activeTerminal.write(pending);
		updateCwdRef.current(pending);
	}, [xtermRef, activeSessionGenerationRef, isStreamReadyRef]);

	const scheduleWriteFlush = useCallback(() => {
		if (isWriteFlushScheduledRef.current) return;
		isWriteFlushScheduledRef.current = true;

		queueMicrotask(() => {
			flushPendingData();
		});
	}, [flushPendingData]);

	const handleTerminalExit = useCallback(
		(exitCode: number, xterm: XTerm, reason?: TerminalExitReason) => {
			isExitedRef.current = true;
			isStreamReadyRef.current = false;

			const wasKilledByUser = reason === "killed";
			wasKilledByUserRef.current = wasKilledByUser;
			setExitStatus(wasKilledByUser ? "killed" : "exited");

			const shouldAutoClosePane = !wasKilledByUser && exitCode === 0;
			if (shouldAutoClosePane) {
				onShellExit?.();
				return;
			}

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
			onShellExit,
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
				setConnectionError("Session lost");
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
				if (
					!matchesSessionGeneration(
						activeSessionGenerationRef.current,
						event.sessionGeneration,
					)
				) {
					if (DEBUG_TERMINAL) {
						console.log("[Terminal] Dropping stale data event:", {
							paneId,
							activeSessionGeneration: activeSessionGenerationRef.current,
							eventSessionGeneration: event.sessionGeneration,
						});
					}
					return;
				}
				if (DEBUG_TERMINAL && !firstStreamDataReceivedRef.current) {
					firstStreamDataReceivedRef.current = true;
					console.log(
						`[Terminal] First stream data received: ${paneId}, ${event.data.length} bytes`,
					);
				}
				const eventGeneration = event.sessionGeneration ?? null;
				if (
					pendingWriteBufferRef.current &&
					pendingWriteGenerationRef.current !== eventGeneration
				) {
					pendingWriteBufferRef.current = "";
					pendingWriteGenerationRef.current = null;
				}
				pendingWriteGenerationRef.current = eventGeneration;
				pendingWriteBufferRef.current += event.data;
				// The main process already batches PTY output to ~60fps. Adding another
				// animation-frame delay in the renderer compounds latency, so only coalesce
				// writes within the current task/microtask.
				if (pendingWriteBufferRef.current.length >= 64 * 1024) {
					flushPendingData();
					return;
				}
				scheduleWriteFlush();
			} else if (event.type === "exit") {
				if (
					!matchesSessionGeneration(
						activeSessionGenerationRef.current,
						event.sessionGeneration,
					)
				) {
					return;
				}
				flushPendingData();
				handleTerminalExit(event.exitCode, xterm, event.reason);
			} else if (event.type === "disconnect") {
				flushPendingData();
				setConnectionError(
					event.reason || "Connection to terminal daemon lost",
				);
			} else if (event.type === "error") {
				if (
					!matchesSessionGeneration(
						activeSessionGenerationRef.current,
						event.sessionGeneration,
					)
				) {
					return;
				}
				flushPendingData();
				handleStreamError(event, xterm);
			}
		},
		[
			paneId,
			xtermRef,
			activeSessionGenerationRef,
			isStreamReadyRef,
			pendingEventsRef,
			handleTerminalExit,
			handleStreamError,
			setConnectionError,
			flushPendingData,
			scheduleWriteFlush,
		],
	);

	return {
		handleTerminalExit,
		handleStreamError,
		handleStreamData,
	};
}
