import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef, useState } from "react";
import { clearTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { DEBUG_TERMINAL } from "../config";
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
	fitAddonRef: React.MutableRefObject<FitAddon | null>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	isFocusedRef: React.MutableRefObject<boolean>;
	didFirstRenderRef: React.MutableRefObject<boolean>;
	pendingInitialStateRef: React.MutableRefObject<CreateOrAttachResult | null>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	createOrAttachRef: React.MutableRefObject<CreateOrAttachMutate>;
	setConnectionError: (error: string | null) => void;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
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
	fitAddonRef,
	isStreamReadyRef,
	isExitedRef,
	wasKilledByUserRef,
	isFocusedRef,
	didFirstRenderRef,
	pendingInitialStateRef,
	pendingEventsRef,
	createOrAttachRef,
	setConnectionError,
	setExitStatus,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
}: UseTerminalColdRestoreOptions): UseTerminalColdRestoreReturn {
	const [isRestoredMode, setIsRestoredMode] = useState(false);
	const [restoredCwd, setRestoredCwd] = useState<string | null>(null);
	const log = useCallback((...args: unknown[]) => {
		if (!DEBUG_TERMINAL) return;
		console.log("[terminal/cold-restore]", ...args);
	}, []);

	// Ref for restoredCwd to use in callbacks
	const restoredCwdRef = useRef(restoredCwd);
	restoredCwdRef.current = restoredCwd;

	const handleRetryConnection = useCallback(() => {
		log("retry:start", { paneId });
		setConnectionError(null);
		const xterm = xtermRef.current;
		if (!xterm) return;

		isStreamReadyRef.current = false;
		log("streamReady", { paneId, ready: false, reason: "retry" });
		pendingInitialStateRef.current = null;

		xterm.clear();
		xterm.writeln("Retrying connection...\r\n");

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
					log("retry:success", {
						paneId,
						isColdRestore: !!result.isColdRestore,
						scrollbackLength: result.scrollback?.length ?? 0,
					});

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
					log("retry:error", {
						paneId,
						message: error.message || "Connection failed",
					});
					if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
						wasKilledByUserRef.current = true;
						isExitedRef.current = true;
						isStreamReadyRef.current = false;
						log("streamReady", {
							paneId,
							ready: false,
							reason: "retry-session-killed",
						});
						setExitStatus("killed");
						setConnectionError(null);
						return;
					}
					setConnectionError(error.message || "Connection failed");
					isStreamReadyRef.current = true;
					log("streamReady", {
						paneId,
						ready: true,
						reason: "retry-error",
					});
					flushPendingEvents();
				},
			},
		);
	}, [
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		isStreamReadyRef,
		isExitedRef,
		wasKilledByUserRef,
		isFocusedRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		createOrAttachRef,
		setConnectionError,
		setExitStatus,
		maybeApplyInitialState,
		flushPendingEvents,
		log,
	]);

	const handleStartShell = useCallback(() => {
		log("startShell:start", {
			paneId,
			cwd: restoredCwdRef.current ?? null,
		});
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
		xterm.write("\r\n\x1b[90m─── New session ───\x1b[0m\r\n\r\n");

		// Reset state for new session
		isStreamReadyRef.current = false;
		log("streamReady", { paneId, ready: false, reason: "start-shell" });
		isExitedRef.current = false;
		wasKilledByUserRef.current = false;
		setExitStatus(null);
		clearTerminalKilledByUser(paneId);
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
					log("startShell:success", {
						paneId,
						isNew: result.isNew,
						scrollbackLength: result.scrollback?.length ?? 0,
					});
					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);

					setTimeout(() => {
						const currentXterm = xtermRef.current;
						if (currentXterm) {
							currentXterm.focus();
						}
					}, 0);
				},
				onError: (error: { message?: string }) => {
					log("startShell:error", {
						paneId,
						message: error.message || "Failed to start shell",
					});
					console.error("[Terminal] Failed to start shell:", error);
					setConnectionError(error.message || "Failed to start shell");
					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);
					isStreamReadyRef.current = true;
					log("streamReady", {
						paneId,
						ready: true,
						reason: "start-shell-error",
					});
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
		log,
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
