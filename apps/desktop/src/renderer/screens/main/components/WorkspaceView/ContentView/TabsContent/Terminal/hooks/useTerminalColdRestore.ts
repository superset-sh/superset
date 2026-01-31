import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef, useState } from "react";
import { clearTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { coldRestoreState } from "../state";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalStreamEvent,
} from "../types";
import { scrollToBottom } from "../utils";

export interface UseTerminalColdRestoreOptions {
	paneId: string;
	workspaceId: string;
	parentTabIdRef: React.MutableRefObject<string | undefined>;
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
	handleStartShell: (cwd?: string | null) => void;
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
	workspaceId,
	parentTabIdRef,
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

	const restoredCwdRef = useRef(restoredCwd);
	restoredCwdRef.current = restoredCwd;

	const handleStartShellRef = useRef<(cwd?: string | null) => void>(() => {});

	const handleRetryConnection = useCallback(() => {
		setConnectionError(null);
		const xterm = xtermRef.current;
		if (!xterm) return;

		isStreamReadyRef.current = false;
		pendingInitialStateRef.current = null;

		xterm.clear();
		xterm.writeln("Retrying connection...\r\n");

		createOrAttachRef.current(
			{
				paneId,
				tabId: parentTabIdRef.current || paneId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result: CreateOrAttachResult) => {
					const currentXterm = xtermRef.current;
					if (!currentXterm) return;

					setConnectionError(null);

					if (result.isColdRestore) {
						const scrollback =
							result.snapshot?.snapshotAnsi ?? result.scrollback;
						coldRestoreState.set(paneId, {
							isRestored: true,
							cwd: result.previousCwd || null,
							scrollback,
						});

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
						handleStartShellRef.current(result.previousCwd || null);
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
				},
			},
		);
	}, [
		paneId,
		workspaceId,
		parentTabIdRef,
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
	]);

	const handleStartShell = useCallback(
		(cwd?: string | null) => {
			const xterm = xtermRef.current;
			const fitAddon = fitAddonRef.current;
			if (!xterm || !fitAddon) return;

			pendingEventsRef.current = [];

			trpcClient.terminal.ackColdRestore.mutate({ paneId }).catch((error) => {
				console.warn("[Terminal] Failed to acknowledge cold restore:", {
					paneId,
					error: error instanceof Error ? error.message : String(error),
				});
			});

			isStreamReadyRef.current = false;
			isExitedRef.current = false;
			wasKilledByUserRef.current = false;
			setExitStatus(null);
			clearTerminalKilledByUser(paneId);
			pendingInitialStateRef.current = null;
			resetModes();

			createOrAttachRef.current(
				{
					paneId,
					tabId: parentTabIdRef.current || paneId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
					cwd: cwd ?? restoredCwdRef.current ?? undefined,
					skipColdRestore: true,
					allowKilled: true,
				},
				{
					onSuccess: (result: CreateOrAttachResult) => {
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
						console.error("[Terminal] Failed to start shell:", error);
						setConnectionError(error.message || "Failed to start shell");
						setIsRestoredMode(false);
						coldRestoreState.delete(paneId);
						isStreamReadyRef.current = true;
						flushPendingEvents();
					},
				},
			);
		},
		[
			paneId,
			workspaceId,
			parentTabIdRef,
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
		],
	);

	handleStartShellRef.current = handleStartShell;

	return {
		isRestoredMode,
		restoredCwd,
		setIsRestoredMode,
		setRestoredCwd,
		handleRetryConnection,
		handleStartShell,
	};
}
