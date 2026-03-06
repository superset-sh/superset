import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef, useState } from "react";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { beginAttachAttempt, isCurrentAttachAttempt } from "../attach-attempt";
import { focusTerminalInput } from "../ghostty-adapter";
import { coldRestoreState } from "../state";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalStreamEvent,
} from "../types";
import { scrollToBottom } from "../utils";

export interface UseTerminalColdRestoreOptions {
	paneId: string;
	tabId: string;
	workspaceId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	attachAttemptRef: React.MutableRefObject<number>;
	activeSessionGenerationRef: React.MutableRefObject<string | null>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	isFocusedRef: React.MutableRefObject<boolean>;
	pendingInitialStateRef: React.MutableRefObject<CreateOrAttachResult | null>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	createOrAttachRef: React.MutableRefObject<CreateOrAttachMutate>;
	setConnectionError: (error: string | null) => void;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
	onViewPending?: () => void;
	onViewReady?: () => void;
}

export interface UseTerminalColdRestoreReturn {
	isRestoredMode: boolean;
	restoredCwd: string | null;
	setIsRestoredMode: (value: boolean) => void;
	setRestoredCwd: (value: string | null) => void;
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
	attachAttemptRef,
	activeSessionGenerationRef,
	isStreamReadyRef,
	isExitedRef,
	wasKilledByUserRef,
	isFocusedRef,
	pendingInitialStateRef,
	pendingEventsRef,
	createOrAttachRef,
	setConnectionError,
	setExitStatus,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
	onViewPending,
	onViewReady,
}: UseTerminalColdRestoreOptions): UseTerminalColdRestoreReturn {
	const [isRestoredMode, setIsRestoredMode] = useState(false);
	const [restoredCwd, setRestoredCwd] = useState<string | null>(null);

	// Ref for restoredCwd to use in callbacks
	const restoredCwdRef = useRef(restoredCwd);
	restoredCwdRef.current = restoredCwd;

	const handleRetryConnection = useCallback(() => {
		setConnectionError(null);
		const xterm = xtermRef.current;
		if (!xterm) return;
		const attachAttempt = beginAttachAttempt(attachAttemptRef);

		onViewPending?.();
		isStreamReadyRef.current = false;
		activeSessionGenerationRef.current = null;
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
					if (
						xtermRef.current !== xterm ||
						!isCurrentAttachAttempt(attachAttemptRef, attachAttempt)
					) {
						return;
					}

					setConnectionError(null);
					xterm.writeln("\x1b[90m[Reconnected]\x1b[0m");

					if (result.isColdRestore) {
						const scrollback =
							result.snapshot?.snapshotAnsi ?? result.scrollback;
						coldRestoreState.set(paneId, {
							isRestored: true,
							cwd: result.previousCwd || null,
							scrollback,
						});
						setIsRestoredMode(true);
						setRestoredCwd(result.previousCwd || null);

						xterm.clear();
						if (scrollback) {
							xterm.write(scrollback, () => {
								requestAnimationFrame(() => {
									if (
										xtermRef.current !== xterm ||
										!isCurrentAttachAttempt(attachAttemptRef, attachAttempt)
									) {
										return;
									}
									scrollToBottom(xterm);
									onViewReady?.();
								});
							});
						} else {
							onViewReady?.();
						}
						return;
					}

					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					if (isFocusedRef.current) {
						focusTerminalInput(xterm);
					}
				},
				onError: (error: { message?: string }) => {
					if (
						xtermRef.current !== xterm ||
						!isCurrentAttachAttempt(attachAttemptRef, attachAttempt)
					) {
						return;
					}
					if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
						wasKilledByUserRef.current = true;
						isExitedRef.current = true;
						isStreamReadyRef.current = false;
						setExitStatus("killed");
						setConnectionError(null);
						return;
					}
					setConnectionError(error.message || "Connection failed");
					isStreamReadyRef.current = true;
					flushPendingEvents();
					onViewReady?.();
				},
			},
		);
	}, [
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		attachAttemptRef,
		activeSessionGenerationRef,
		isStreamReadyRef,
		isExitedRef,
		wasKilledByUserRef,
		isFocusedRef,
		pendingInitialStateRef,
		createOrAttachRef,
		setConnectionError,
		setExitStatus,
		maybeApplyInitialState,
		flushPendingEvents,
		onViewPending,
		onViewReady,
	]);

	const handleStartShell = useCallback(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;
		const attachAttempt = beginAttachAttempt(attachAttemptRef);

		// Drop any queued events from the pre-restore session
		pendingEventsRef.current = [];
		onViewPending?.();

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
		isStreamReadyRef.current = false;
		activeSessionGenerationRef.current = null;
		isExitedRef.current = false;
		wasKilledByUserRef.current = false;
		setExitStatus(null);
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
					if (
						xtermRef.current !== xterm ||
						!isCurrentAttachAttempt(attachAttemptRef, attachAttempt)
					) {
						return;
					}
					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);

					setTimeout(() => {
						if (
							xtermRef.current !== xterm ||
							!isCurrentAttachAttempt(attachAttemptRef, attachAttempt)
						) {
							return;
						}
						focusTerminalInput(xterm);
					}, 0);
				},
				onError: (error: { message?: string }) => {
					if (
						xtermRef.current !== xterm ||
						!isCurrentAttachAttempt(attachAttemptRef, attachAttempt)
					) {
						return;
					}
					console.error("[Terminal] Failed to start shell:", error);
					setConnectionError(error.message || "Failed to start shell");
					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);
					isStreamReadyRef.current = true;
					flushPendingEvents();
					onViewReady?.();
				},
			},
		);
	}, [
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		attachAttemptRef,
		activeSessionGenerationRef,
		isStreamReadyRef,
		isExitedRef,
		wasKilledByUserRef,
		pendingInitialStateRef,
		pendingEventsRef,
		createOrAttachRef,
		setConnectionError,
		setExitStatus,
		maybeApplyInitialState,
		flushPendingEvents,
		resetModes,
		onViewPending,
		onViewReady,
	]);

	return {
		isRestoredMode,
		restoredCwd,
		setIsRestoredMode,
		setRestoredCwd,
		handleRetryConnection,
		handleStartShell,
	};
}
