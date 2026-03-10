import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { coldRestoreState } from "../state";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalStreamEvent,
} from "../types";
import { scrollToBottom } from "../utils";
import type { TerminalSessionController } from "./useTerminalSessionController";

export interface UseTerminalColdRestoreOptions {
	paneId: string;
	tabId: string;
	workspaceId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	fitAddonRef: React.MutableRefObject<FitAddon | null>;
	isFocusedRef: React.MutableRefObject<boolean>;
	didFirstRenderRef: React.MutableRefObject<boolean>;
	pendingInitialStateRef: React.MutableRefObject<CreateOrAttachResult | null>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	session: Pick<
		TerminalSessionController,
		| "beginAttach"
		| "enterRestoredMode"
		| "exitRestoredMode"
		| "recordExit"
		| "restoredCwd"
		| "setConnectionError"
		| "setStreamReady"
	>;
	createOrAttachRef: React.MutableRefObject<CreateOrAttachMutate>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
}

export interface UseTerminalColdRestoreReturn {
	handleRetryConnection: () => void;
	handleStartShell: () => void;
}

/**
 * Hook to manage cold restore (reboot recovery) functionality.
 *
 * Handles:
 * - Retry connection after daemon loss
 * - Starting new shell from restored scrollback
 * - Managing cold restore overlay state
 */
export function useTerminalColdRestore({
	paneId,
	tabId,
	workspaceId,
	xtermRef,
	fitAddonRef,
	isFocusedRef,
	didFirstRenderRef,
	pendingInitialStateRef,
	pendingEventsRef,
	session,
	createOrAttachRef,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
}: UseTerminalColdRestoreOptions): UseTerminalColdRestoreReturn {
	const {
		beginAttach,
		enterRestoredMode,
		exitRestoredMode,
		recordExit,
		restoredCwd,
		setConnectionError,
		setStreamReady,
	} = session;

	// Ref for restoredCwd to use in callbacks
	const restoredCwdRef = useRef(restoredCwd);
	restoredCwdRef.current = restoredCwd;

	const handleRetryConnection = useCallback(() => {
		setConnectionError(null);
		const xterm = xtermRef.current;
		if (!xterm) return;

		beginAttach();
		pendingInitialStateRef.current = null;

		createOrAttachRef.current(
			{
				paneId,
				tabId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result: CreateOrAttachResult) => {
					const currentXterm = xtermRef.current;
					if (!currentXterm) return;

					setConnectionError(null);
					currentXterm.writeln("\x1b[90m[Reconnected]\x1b[0m");

					if (result.isColdRestore) {
						const scrollback =
							result.snapshot?.snapshotAnsi ?? result.scrollback;
						coldRestoreState.set(paneId, {
							isRestored: true,
							cwd: result.previousCwd || null,
							scrollback,
						});
						enterRestoredMode(result.previousCwd || null);

						currentXterm.clear();
						if (scrollback) {
							currentXterm.write(scrollback, () => {
								requestAnimationFrame(() => {
									if (xtermRef.current !== currentXterm) return;
									scrollToBottom(currentXterm);
								});
							});
						}

						didFirstRenderRef.current = true;
						return;
					}

					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					if (isFocusedRef.current) {
						currentXterm.focus();
					}
				},
				onError: (error: { message?: string }) => {
					if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
						recordExit("killed");
						setConnectionError(null);
						return;
					}
					setConnectionError(error.message || "Connection failed");
					setStreamReady(true);
					flushPendingEvents();
				},
			},
		);
	}, [
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		beginAttach,
		enterRestoredMode,
		isFocusedRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		recordExit,
		createOrAttachRef,
		setConnectionError,
		setStreamReady,
		maybeApplyInitialState,
		flushPendingEvents,
	]);

	const handleStartShell = useCallback(() => {
		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!xterm || !fitAddon) return;

		// Drop any queued events from the pre-restore session
		pendingEventsRef.current = [];

		// Acknowledge cold restore to main process
		trpcClient.terminal.ackColdRestore.mutate({ paneId }).catch((error) => {
			console.warn("[Terminal] Failed to acknowledge cold restore:", {
				paneId,
				error: error instanceof Error ? error.message : String(error),
			});
		});

		// Add visual separator
		xterm.write("\r\n\x1b[90m─── Session Contents Restored ───\x1b[0m\r\n\r\n");

		// Reset state for new session
		beginAttach();
		pendingInitialStateRef.current = null;
		resetModes();

		// Create new session with previous cwd
		createOrAttachRef.current(
			{
				paneId,
				tabId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
				cwd: restoredCwdRef.current || undefined,
				skipColdRestore: true,
				allowKilled: true,
			},
			{
				onSuccess: (result: CreateOrAttachResult) => {
					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					exitRestoredMode();
					coldRestoreState.delete(paneId);

					setTimeout(() => {
						const currentXterm = xtermRef.current;
						if (currentXterm) {
							currentXterm.focus();
						}
					}, 0);
				},
				onError: (error: { message?: string }) => {
					console.error("[Terminal] Failed to start shell:", error);
					setConnectionError(error.message || "Failed to start shell");
					exitRestoredMode();
					coldRestoreState.delete(paneId);
					setStreamReady(true);
					flushPendingEvents();
				},
			},
		);
	}, [
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		fitAddonRef,
		beginAttach,
		exitRestoredMode,
		pendingInitialStateRef,
		pendingEventsRef,
		createOrAttachRef,
		setConnectionError,
		setStreamReady,
		maybeApplyInitialState,
		flushPendingEvents,
		resetModes,
	]);

	return {
		handleRetryConnection,
		handleStartShell,
	};
}
