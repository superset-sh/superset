import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import { toast } from "@superset/ui/sonner";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { IDisposable, Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuPower, LuTerminal } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	clearTerminalKilledByUser,
	isTerminalKilledByUser,
} from "renderer/lib/terminal-kill-tracking";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import { useTerminalTheme } from "renderer/stores/theme";
import { scheduleTerminalAttach } from "./attach-scheduler";
import { sanitizeForTitle } from "./commandBuffer";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupClickToMoveCursor,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
	type TerminalRendererRef,
} from "./helpers";
import { useTerminalConnection } from "./hooks";
import { parseCwd } from "./parseCwd";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { TerminalSearch } from "./TerminalSearch";
import type { TerminalProps, TerminalStreamEvent } from "./types";
import {
	getScrollOffsetFromBottom,
	scrollToBottom,
	shellEscapePaths,
} from "./utils";

const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

// Module-level map to track pending detach timeouts.
// This survives React StrictMode's unmount/remount cycle, allowing us to
// cancel a pending detach if the component immediately remounts.
const pendingDetaches = new Map<string, NodeJS.Timeout>();

// Module-level map to track cold restore state across StrictMode cycles.
// When cold restore is detected, we store the state here so it survives
// the unmount/remount that StrictMode causes. Without this, the first mount
// detects cold restore and sets state, but StrictMode unmounts and remounts
// with fresh state, losing the cold restore detection.
const coldRestoreState = new Map<
	string,
	{ isRestored: boolean; cwd: string | null; scrollback: string }
>();

type CreateOrAttachResult = {
	wasRecovered: boolean;
	isNew: boolean;
	scrollback: string;
	viewportY?: number;
	// Cold restore fields (for reboot recovery)
	isColdRestore?: boolean;
	previousCwd?: string;
	snapshot?: {
		snapshotAnsi: string;
		rehydrateSequences: string;
		cwd: string | null;
		modes: Record<string, boolean>;
		cols: number;
		rows: number;
		scrollbackLines: number;
		debug?: {
			xtermBufferType: string;
			hasAltScreenEntry: boolean;
			altBuffer?: {
				lines: number;
				nonEmptyLines: number;
				totalChars: number;
				cursorX: number;
				cursorY: number;
				sampleLines: string[];
			};
			normalBufferLines: number;
		};
	};
};

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const paneId = tabId;
	// Use granular selectors to avoid re-renders when other panes change
	const pane = useTabsStore((s) => s.panes[paneId]);
	const paneInitialCommands = pane?.initialCommands;
	const paneInitialCwd = pane?.initialCwd;
	const clearPaneInitialData = useTabsStore((s) => s.clearPaneInitialData);
	const parentTabId = pane?.tabId;
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const rendererRef = useRef<TerminalRendererRef | null>(null);
	const isExitedRef = useRef(false);
	const [exitStatus, setExitStatus] = useState<"killed" | "exited" | null>(
		null,
	);
	const wasKilledByUserRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const commandBufferRef = useRef("");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [cwdConfirmed, setCwdConfirmed] = useState(false);
	// Cold restore state (for reboot recovery)
	const [isRestoredMode, setIsRestoredMode] = useState(false);
	const [restoredCwd, setRestoredCwd] = useState<string | null>(null);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const updatePaneCwd = useTabsStore((s) => s.updatePaneCwd);
	// Use granular selector - only subscribe to this tab's focused pane
	const focusedPaneId = useTabsStore(
		(s) => s.focusedPaneIds[pane?.tabId ?? ""],
	);
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);
	const terminalTheme = useTerminalTheme();

	// Terminal connection state and mutations (extracted to hook for cleaner code)
	const {
		connectionError,
		setConnectionError,
		workspaceCwd,
		refs: {
			createOrAttach: createOrAttachRef,
			write: writeRef,
			resize: resizeRef,
			detach: detachRef,
			clearScrollback: clearScrollbackRef,
		},
	} = useTerminalConnection({ workspaceId });

	// Avoid effect re-runs: track overlay states via refs for input gating.
	const isRestoredModeRef = useRef(isRestoredMode);
	isRestoredModeRef.current = isRestoredMode;
	const connectionErrorRef = useRef(connectionError);
	connectionErrorRef.current = connectionError;

	// Ref for initial theme to avoid recreating terminal on theme change
	const initialThemeRef = useRef(terminalTheme);

	const isFocused = focusedPaneId === paneId;

	// Gate streaming until initial state restoration is applied to avoid interleaving output.
	const isStreamReadyRef = useRef(false);

	// Gate restoration until xterm has rendered at least once (renderer/viewport ready).
	const didFirstRenderRef = useRef(false);
	const pendingInitialStateRef = useRef<CreateOrAttachResult | null>(null);
	const renderDisposableRef = useRef<IDisposable | null>(null);
	const restoreSequenceRef = useRef(0);
	const restartTerminalRef = useRef<() => void>(() => {});

	// Track alternate screen mode ourselves (xterm.buffer.active.type is unreliable after HMR/recovery)
	// Updated from: snapshot.modes.alternateScreen on restore, escape sequences in stream
	const isAlternateScreenRef = useRef(false);
	// Track bracketed paste mode so large pastes can preserve a single bracketed-paste envelope.
	const isBracketedPasteRef = useRef(false);
	// Track mode toggles across chunk boundaries (escape sequences can span stream frames).
	const modeScanBufferRef = useRef("");

	// Refs avoid effect re-runs when these values change
	const isFocusedRef = useRef(isFocused);
	isFocusedRef.current = isFocused;

	const paneInitialCommandsRef = useRef(paneInitialCommands);
	const paneInitialCwdRef = useRef(paneInitialCwd);
	const clearPaneInitialDataRef = useRef(clearPaneInitialData);
	paneInitialCommandsRef.current = paneInitialCommands;
	paneInitialCwdRef.current = paneInitialCwd;
	clearPaneInitialDataRef.current = clearPaneInitialData;

	// Use ref for workspaceCwd to avoid terminal recreation when query loads
	// (changing from undefined→string triggers useEffect, causing xterm errors)
	const workspaceCwdRef = useRef(workspaceCwd);
	workspaceCwdRef.current = workspaceCwd;

	// Query terminal link behavior setting
	const { data: terminalLinkBehavior } =
		electronTrpc.settings.getTerminalLinkBehavior.useQuery();

	// Handler for file link clicks - uses current setting value
	const handleFileLinkClick = useCallback(
		(path: string, line?: number, column?: number) => {
			const behavior = terminalLinkBehavior ?? "external-editor";

			// Helper to open in external editor
			const openInExternalEditor = () => {
				trpcClient.external.openFileInEditor
					.mutate({
						path,
						line,
						column,
						cwd: workspaceCwd ?? undefined,
					})
					.catch((error) => {
						console.error(
							"[Terminal] Failed to open file in editor:",
							path,
							error,
						);
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						toast.error("Failed to open file in editor", {
							description: errorMessage,
						});
					});
			};

			if (behavior === "file-viewer") {
				// If workspaceCwd is not loaded yet, fall back to external editor
				// This prevents confusing errors when the workspace is still initializing
				if (!workspaceCwd) {
					console.warn(
						"[Terminal] workspaceCwd not loaded, falling back to external editor",
					);
					openInExternalEditor();
					return;
				}

				// Normalize absolute paths to worktree-relative paths for file viewer
				// File viewer expects relative paths, but terminal links can be absolute
				let filePath = path;
				// Use path boundary check to avoid incorrect prefix stripping
				// e.g., /repo vs /repo-other should not match
				if (path === workspaceCwd) {
					filePath = ".";
				} else if (path.startsWith(`${workspaceCwd}/`)) {
					filePath = path.slice(workspaceCwd.length + 1);
				} else if (path.startsWith("/")) {
					// Absolute path outside workspace - show warning and don't attempt to open
					toast.warning("File is outside the workspace", {
						description:
							"Switch to 'External editor' in Settings to open this file",
					});
					return;
				}
				addFileViewerPane(workspaceId, { filePath, line, column });
			} else {
				openInExternalEditor();
			}
		},
		[terminalLinkBehavior, workspaceId, workspaceCwd, addFileViewerPane],
	);

	// Ref to avoid terminal recreation when callback changes
	const handleFileLinkClickRef = useRef(handleFileLinkClick);
	handleFileLinkClickRef.current = handleFileLinkClick;

	// Seed cwd from initialCwd or workspace path (shell spawns there)
	// OSC-7 will override if/when the shell reports directory changes
	useEffect(() => {
		if (terminalCwd) return; // Already have a cwd, don't override
		const seedCwd = paneInitialCwd || workspaceCwd;
		if (seedCwd) {
			setTerminalCwd(seedCwd);
			setCwdConfirmed(false); // Seeded, not confirmed by OSC-7
		}
	}, [paneInitialCwd, workspaceCwd, terminalCwd]);

	// Debounced CWD update to reduce store updates during rapid directory changes
	const debouncedUpdatePaneCwdRef = useRef(
		debounce((id: string, cwd: string | null, confirmed: boolean) => {
			updatePaneCwd(id, cwd, confirmed);
		}, 150),
	);

	// Sync terminal cwd to store for DirectoryNavigator (debounced)
	useEffect(() => {
		debouncedUpdatePaneCwdRef.current(
			paneId,
			terminalCwd,
			cwdConfirmed ?? false,
		);
	}, [terminalCwd, cwdConfirmed, paneId]);

	// Cleanup debounced function on unmount
	useEffect(() => {
		const debouncedFn = debouncedUpdatePaneCwdRef.current;
		return () => {
			debouncedFn.cancel();
		};
	}, []);

	// Parse terminal data for cwd (OSC 7 sequences)
	const updateCwdFromData = useCallback((data: string) => {
		const cwd = parseCwd(data);
		if (cwd !== null) {
			setTerminalCwd(cwd);
			setCwdConfirmed(true); // Confirmed by OSC-7
		}
	}, []);

	// Ref to use cwd parser inside effect
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;

	const registerClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerClearCallback,
	);
	const unregisterClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterClearCallback,
	);
	const registerScrollToBottomCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerScrollToBottomCallback,
	);
	const unregisterScrollToBottomCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterScrollToBottomCallback,
	);

	const parentTabIdRef = useRef(parentTabId);
	parentTabIdRef.current = parentTabId;

	const setTabAutoTitleRef = useRef(setTabAutoTitle);
	setTabAutoTitleRef.current = setTabAutoTitle;

	const debouncedSetTabAutoTitleRef = useRef(
		debounce((tabId: string, title: string) => {
			setTabAutoTitleRef.current(tabId, title);
		}, 100),
	);

	const updateModesFromData = useCallback((data: string) => {
		// Escape sequences can be split across streamed frames, so scan using a small carry buffer.
		const combined = modeScanBufferRef.current + data;

		const enterAltIndex = Math.max(
			combined.lastIndexOf("\x1b[?1049h"),
			combined.lastIndexOf("\x1b[?47h"),
		);
		const exitAltIndex = Math.max(
			combined.lastIndexOf("\x1b[?1049l"),
			combined.lastIndexOf("\x1b[?47l"),
		);
		if (enterAltIndex !== -1 || exitAltIndex !== -1) {
			isAlternateScreenRef.current = enterAltIndex > exitAltIndex;
		}

		const enableBracketedIndex = combined.lastIndexOf("\x1b[?2004h");
		const disableBracketedIndex = combined.lastIndexOf("\x1b[?2004l");
		if (enableBracketedIndex !== -1 || disableBracketedIndex !== -1) {
			isBracketedPasteRef.current =
				enableBracketedIndex > disableBracketedIndex;
		}

		// Keep a small tail in case the next chunk starts mid-sequence.
		modeScanBufferRef.current = combined.slice(-32);
	}, []);

	const updateModesFromDataRef = useRef(updateModesFromData);
	updateModesFromDataRef.current = updateModesFromData;

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
			// "working" and "permission" should clear (agent no longer active)
			// "review" should persist (user needs to see completed work)
			const currentPane = useTabsStore.getState().panes[paneId];
			if (
				currentPane?.status === "working" ||
				currentPane?.status === "permission"
			) {
				setPaneStatus(paneId, "idle");
			}
		},
		[paneId, setPaneStatus],
	);

	const flushPendingEvents = useCallback(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;
		if (pendingEventsRef.current.length === 0) return;

		const events = pendingEventsRef.current.splice(
			0,
			pendingEventsRef.current.length,
		);

		for (const event of events) {
			if (event.type === "data") {
				updateModesFromDataRef.current(event.data);
				xterm.write(event.data);
				updateCwdRef.current(event.data);
			} else if (event.type === "exit") {
				handleTerminalExit(event.exitCode, xterm);
			} else if (event.type === "disconnect") {
				setConnectionError(
					event.reason || "Connection to terminal daemon lost",
				);
			} else if (event.type === "error") {
				const message = event.code
					? `${event.code}: ${event.error}`
					: event.error;
				console.warn("[Terminal] stream error:", message);

				// "Session not found" means daemon restarted and lost our session -
				// promote to connection error so retry UI appears and cold restore can kick in.
				// Don't show toast for this case since we're showing the retry UI.
				if (
					event.code === "WRITE_FAILED" &&
					event.error?.includes("Session not found")
				) {
					setConnectionError("Session lost - click to reconnect");
					return;
				}

				// "PTY not spawned" is a transient race condition during recovery -
				// the write was attempted before PTY finished initializing. Skip toast,
				// just log to terminal. The session will recover on its own.
				if (
					event.code === "WRITE_FAILED" &&
					event.error?.includes("PTY not spawned")
				) {
					xterm.writeln(`\r\n[Terminal] ${message}`);
					return;
				}

				// Show toast for other errors
				toast.error("Terminal error", {
					description: message,
				});

				// Don't block interaction for non-fatal issues like a paste drop or a
				// transient write failure (we keep the session alive).
				if (
					event.code === "WRITE_QUEUE_FULL" ||
					event.code === "WRITE_FAILED"
				) {
					xterm.writeln(`\r\n[Terminal] ${message}`);
				} else {
					setConnectionError(message);
				}
			}
		}
	}, [handleTerminalExit, setConnectionError]);

	const maybeApplyInitialState = useCallback(() => {
		if (!didFirstRenderRef.current) return;
		const result = pendingInitialStateRef.current;
		if (!result) return;

		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!xterm || !fitAddon) return;

		// Clear before applying to prevent double-apply on concurrent triggers.
		pendingInitialStateRef.current = null;
		const _restoreSequence = ++restoreSequenceRef.current;

		try {
			// Canonical initial content: prefer snapshot (daemon mode) over scrollback (non-daemon)
			// In daemon mode, scrollback is empty to avoid duplicating the payload over IPC.
			const initialAnsi = result.snapshot?.snapshotAnsi ?? result.scrollback;

			// Track alternate screen mode from snapshot for our own reference
			// (xterm.buffer.active.type is unreliable after HMR/recovery)
			isAlternateScreenRef.current = !!result.snapshot?.modes.alternateScreen;
			isBracketedPasteRef.current = !!result.snapshot?.modes.bracketedPaste;
			modeScanBufferRef.current = "";

			// Fallback: parse initialAnsi for escape sequences when snapshot.modes is unavailable.
			// This handles non-daemon mode and edge cases where daemon didn't track the mode.
			if (initialAnsi && result.snapshot?.modes === undefined) {
				// Use lastIndexOf to find the final state - handles multiple enter/exit cycles
				// (e.g., user opened vim, closed it, opened it again)
				const enterAltIndex = Math.max(
					initialAnsi.lastIndexOf("\x1b[?1049h"),
					initialAnsi.lastIndexOf("\x1b[?47h"),
				);
				const exitAltIndex = Math.max(
					initialAnsi.lastIndexOf("\x1b[?1049l"),
					initialAnsi.lastIndexOf("\x1b[?47l"),
				);
				if (enterAltIndex !== -1 || exitAltIndex !== -1) {
					isAlternateScreenRef.current = enterAltIndex > exitAltIndex;
				}

				// Bracketed paste mode can toggle during a session - use the last seen state.
				const bracketEnableIndex = initialAnsi.lastIndexOf("\x1b[?2004h");
				const bracketDisableIndex = initialAnsi.lastIndexOf("\x1b[?2004l");
				if (bracketEnableIndex !== -1 || bracketDisableIndex !== -1) {
					isBracketedPasteRef.current =
						bracketEnableIndex > bracketDisableIndex;
				}
			}

			// Resize xterm to match snapshot dimensions before applying content.
			// The snapshot's cursor positioning assumes specific cols/rows.
			const snapshotCols = result.snapshot?.cols;
			const snapshotRows = result.snapshot?.rows;
			if (
				snapshotCols &&
				snapshotRows &&
				(xterm.cols !== snapshotCols || xterm.rows !== snapshotRows)
			) {
				xterm.resize(snapshotCols, snapshotRows);
			}

			const isAltScreenReattach =
				!result.isNew && result.snapshot?.modes.alternateScreen;

			// For alt-screen (TUI) sessions, the serialized snapshot often renders
			// incorrectly because styled spaces and positioning get lost. Instead of
			// writing broken snapshot, enter alt-screen and trigger SIGWINCH so the
			// TUI redraws itself via the live stream.
			// NOTE: This is primarily a fallback path for app restart recovery.
			// During normal workspace/tab switching with persistence enabled,
			// terminals stay mounted and this code path is not triggered.
			if (isAltScreenReattach) {
				// Enter alt-screen mode and WAIT for xterm to process it before proceeding.
				// xterm.write() is async - if we trigger SIGWINCH before alt-screen is entered,
				// the TUI receives SIGWINCH in normal mode, ignores it, then xterm switches
				// buffers and we get a white screen.
				xterm.write("\x1b[?1049h", () => {
					// Apply rehydration sequences for other modes (bracketed paste, etc.)
					if (result.snapshot?.rehydrateSequences) {
						// Filter out alt-screen sequences since we already entered
						const ESC = "\x1b";
						const filteredRehydrate = result.snapshot.rehydrateSequences
							.split(`${ESC}[?1049h`)
							.join("")
							.split(`${ESC}[?47h`)
							.join("");
						if (filteredRehydrate) {
							xterm.write(filteredRehydrate);
						}
					}

					// NOW safe to enable streaming and flush pending events
					isStreamReadyRef.current = true;
					if (DEBUG_TERMINAL) {
						console.log(
							`[Terminal] isStreamReady=true (altScreen): ${paneId}, pendingEvents=${pendingEventsRef.current.length}`,
						);
					}
					flushPendingEvents();

					// Fit terminal to container - triggers resize which sends SIGWINCH
					requestAnimationFrame(() => {
						if (xtermRef.current !== xterm) return;
						fitAddon.fit();
					});
				});

				// Use snapshot.cwd if available, otherwise parse from content
				if (result.snapshot?.cwd) {
					updateCwdRef.current(result.snapshot.cwd);
				} else {
					updateCwdRef.current(initialAnsi);
				}
				return; // Skip normal snapshot flow
			}

			const rehydrateSequences = result.snapshot?.rehydrateSequences ?? "";

			const finalizeRestore = () => {
				// Enable streaming AFTER xterm has processed the restoration writes.
				// This prevents live PTY output from interleaving with snapshot replay.
				isStreamReadyRef.current = true;

				// Fit terminal to container - triggers resize which sends SIGWINCH
				requestAnimationFrame(() => {
					if (xtermRef.current !== xterm) return;
					fitAddon.fit();
				});
				if (DEBUG_TERMINAL) {
					console.log(
						`[Terminal] isStreamReady=true (finalizeRestore): ${paneId}, pendingEvents=${pendingEventsRef.current.length}`,
					);
				}
				flushPendingEvents();
			};

			const writeSnapshot = () => {
				// xterm's WriteBuffer skips empty string chunks and never calls the callback.
				// If there's no snapshot content, enable streaming immediately.
				if (!initialAnsi) {
					finalizeRestore();
					return;
				}

				// xterm.write() is asynchronous - escape sequences may not be fully
				// processed when the terminal first renders, causing garbled display.
				// Force a re-render after write completes to ensure correct display.
				// (Symptom: restored terminals show corrupted text until resized)
				// Use fitAddon.fit() and (when using WebGL) clear the glyph atlas to force a full repaint.
				xterm.write(initialAnsi, finalizeRestore);
			};

			// Apply rehydration sequences to restore other terminal modes
			// (app cursor mode, bracketed paste, mouse tracking, etc.) before replaying snapshot.
			if (rehydrateSequences) {
				xterm.write(rehydrateSequences, writeSnapshot);
			} else {
				writeSnapshot();
			}

			// Use snapshot.cwd if available, otherwise parse from content
			if (result.snapshot?.cwd) {
				updateCwdRef.current(result.snapshot.cwd);
			} else {
				updateCwdRef.current(initialAnsi);
			}
		} catch (error) {
			console.error("[Terminal] Restoration failed:", error);
			// Fail-open: even on error, mark stream ready and flush pending events
			// to prevent terminal from wedging with unbounded event queue
			isStreamReadyRef.current = true;
			flushPendingEvents();
		}
	}, [flushPendingEvents, paneId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: createOrAttachRef used intentionally to read latest value without recreating callback
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
				onSuccess: (result) => {
					// Use fresh xterm ref in case component remounted during async operation
					const currentXterm = xtermRef.current;
					if (!currentXterm) return;

					setConnectionError(null);

					// Handle cold restore on retry (daemon lost session, disk history available)
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

						// Clear retry message and write scrollback
						currentXterm.clear();
						if (scrollback) {
							currentXterm.write(scrollback);
						}

						// Don't enable streaming - user must click Start Shell
						didFirstRenderRef.current = true;
						// Don't focus - user needs to interact with overlay button
						return;
					}

					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					// Re-focus terminal after successful reconnection (non-cold-restore)
					if (isFocusedRef.current) {
						currentXterm.focus();
					}
				},
				onError: (error) => {
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
		maybeApplyInitialState,
		flushPendingEvents,
		setConnectionError,
		setIsRestoredMode,
		setRestoredCwd,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refs (createOrAttachRef, resizeRef) used intentionally to read latest values without recreating callback
	const handleStartShell = useCallback(() => {
		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!xterm || !fitAddon) return;

		// Keep the overlay up while we create the new session; clear it on success.

		// Drop any queued events from the pre-restore session. In cold restore mode
		// streaming is intentionally paused, so stale `exit` events can accumulate.
		// If we replay them after starting a new shell, the terminal gets marked as
		// exited and future input triggers an unintended restart (which clears the UI).
		pendingEventsRef.current = [];

		// Acknowledge cold restore to main process (clears sticky state)
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
		isExitedRef.current = false; // Critical: reset so handleTerminalInput writes to shell
		wasKilledByUserRef.current = false;
		setExitStatus(null);
		clearTerminalKilledByUser(paneId);
		pendingInitialStateRef.current = null;
		isAlternateScreenRef.current = false;
		isBracketedPasteRef.current = false;
		modeScanBufferRef.current = "";

		// Create new session with previous cwd
		createOrAttachRef.current(
			{
				paneId,
				tabId: parentTabIdRef.current || paneId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
				cwd: restoredCwd || undefined,
				skipColdRestore: true,
				allowKilled: true,
			},
			{
				onSuccess: (result) => {
					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					// Clear restored mode AFTER session is ready so the overlay doesn't
					// disappear until we have a live session to show.
					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);

					// Always focus terminal after Start Shell - user explicitly clicked to start
					// Use setTimeout to ensure DOM is ready after overlay removal
					setTimeout(() => {
						const currentXterm = xtermRef.current;
						if (currentXterm) {
							currentXterm.focus();
						}
					}, 0);
				},
				onError: (error) => {
					console.error("[Terminal] Failed to start shell:", error);
					setConnectionError(error.message || "Failed to start shell");
					// Clear restored mode on error too so user can retry
					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);
					isStreamReadyRef.current = true;
					flushPendingEvents();
				},
			},
		);
	}, [
		paneId,
		workspaceId,
		restoredCwd,
		maybeApplyInitialState,
		flushPendingEvents,
		setConnectionError,
		setIsRestoredMode,
	]);

	// Track first data event for debugging
	const firstStreamDataReceivedRef = useRef(false);

	const handleStreamData = (event: TerminalStreamEvent) => {
		// Queue events until terminal is ready to prevent data loss
		if (!xtermRef.current || !isStreamReadyRef.current) {
			if (DEBUG_TERMINAL && event.type === "data") {
				console.log(
					`[Terminal] Queuing event (not ready): ${paneId}, type=${event.type}, bytes=${event.data.length}, isStreamReady=${isStreamReadyRef.current}`,
				);
			}
			pendingEventsRef.current.push(event);
			return;
		}

		if (event.type === "data") {
			if (DEBUG_TERMINAL && !firstStreamDataReceivedRef.current) {
				firstStreamDataReceivedRef.current = true;
				console.log(
					`[Terminal] First stream data received: ${paneId}, ${event.data.length} bytes`,
				);
			}
			updateModesFromDataRef.current(event.data);
			xtermRef.current.write(event.data);
			updateCwdFromData(event.data);
		} else if (event.type === "exit") {
			const xterm = xtermRef.current;
			if (xterm) {
				handleTerminalExit(event.exitCode, xterm);
			}
		} else if (event.type === "disconnect") {
			// Daemon connection lost - show error UI with retry option
			setConnectionError(event.reason || "Connection to terminal daemon lost");
		} else if (event.type === "error") {
			const message = event.code
				? `${event.code}: ${event.error}`
				: event.error;
			console.warn("[Terminal] stream error:", message);

			// "Session not found" means daemon restarted and lost our session -
			// promote to connection error so retry UI appears and cold restore can kick in.
			// Don't show toast for this case since we're showing the retry UI.
			if (
				event.code === "WRITE_FAILED" &&
				event.error?.includes("Session not found")
			) {
				setConnectionError("Session lost - click to reconnect");
				return;
			}

			// "PTY not spawned" is a transient race condition during recovery -
			// the write was attempted before PTY finished initializing. Skip toast,
			// just log to terminal. The session will recover on its own.
			if (
				event.code === "WRITE_FAILED" &&
				event.error?.includes("PTY not spawned")
			) {
				xtermRef.current.writeln(`\r\n[Terminal] ${message}`);
				return;
			}

			// Show toast for other errors
			toast.error("Terminal error", {
				description: message,
			});

			// Don't block interaction for non-fatal issues like a paste drop or a
			// transient write failure (we keep the session alive).
			if (event.code === "WRITE_QUEUE_FULL" || event.code === "WRITE_FAILED") {
				xtermRef.current.writeln(`\r\n[Terminal] ${message}`);
			} else {
				setConnectionError(message);
			}
		}
	};

	electronTrpc.terminal.stream.useSubscription(paneId, {
		onData: handleStreamData,
		enabled: true,
	});

	// Use ref to avoid triggering full terminal recreation when focus handler changes
	const handleTerminalFocusRef = useRef(() => {});
	handleTerminalFocusRef.current = () => {
		if (pane?.tabId) {
			setFocusedPane(pane.tabId, paneId);
		}
	};

	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
		}
	}, [isFocused]);

	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;

		if (isFocused) {
			xterm.focus();
		}
	}, [isFocused]);

	useAppHotkey(
		"FIND_IN_TERMINAL",
		() => {
			setIsSearchOpen((prev) => !prev);
		},
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	useAppHotkey(
		"SCROLL_TO_BOTTOM",
		() => {
			if (xtermRef.current) {
				scrollToBottom(xtermRef.current);
			}
		},
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refs (writeRef, resizeRef, detachRef, clearScrollbackRef, createOrAttachRef) used intentionally to read latest values without resubscribing
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		if (DEBUG_TERMINAL) {
			console.log(`[Terminal] Mount: ${paneId}`);
		}

		// Cancel any pending detach from a previous unmount (e.g., React StrictMode's
		// simulated unmount/remount cycle). This prevents the detach from corrupting
		// the terminal state when we're immediately remounting.
		const pendingDetach = pendingDetaches.get(paneId);
		if (pendingDetach) {
			clearTimeout(pendingDetach);
			pendingDetaches.delete(paneId);
		}

		let isUnmounted = false;

		const {
			xterm,
			fitAddon,
			renderer,
			cleanup: cleanupQuerySuppression,
		} = createTerminalInstance(container, {
			cwd: workspaceCwdRef.current ?? undefined,
			initialTheme: initialThemeRef.current,
			onFileLinkClick: (path, line, column) =>
				handleFileLinkClickRef.current(path, line, column),
		});
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		rendererRef.current = renderer;
		isExitedRef.current = false;
		setXtermInstance(xterm);
		isStreamReadyRef.current = false;
		didFirstRenderRef.current = false;
		pendingInitialStateRef.current = null;
		isStreamReadyRef.current = false;
		didFirstRenderRef.current = false;
		pendingInitialStateRef.current = null;

		if (isFocusedRef.current) {
			xterm.focus();
		}

		import("@xterm/addon-search").then(({ SearchAddon }) => {
			if (isUnmounted) return;
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		});

		// Wait for xterm to render once before applying restoration data.
		// This prevents crashes when writing rehydrate escape sequences too early.
		renderDisposableRef.current?.dispose();
		let firstRenderFallback: ReturnType<typeof setTimeout> | null = null;

		renderDisposableRef.current = xterm.onRender(() => {
			if (firstRenderFallback) {
				clearTimeout(firstRenderFallback);
				firstRenderFallback = null;
			}
			renderDisposableRef.current?.dispose();
			renderDisposableRef.current = null;
			didFirstRenderRef.current = true;
			maybeApplyInitialState();
		});

		// Failure-proofing: if the renderer never emits an initial render (e.g. WebGL hiccup,
		// offscreen mount), don't leave the session stuck in "not ready" forever.
		firstRenderFallback = setTimeout(() => {
			if (isUnmounted) return;
			if (didFirstRenderRef.current) return;
			didFirstRenderRef.current = true;
			maybeApplyInitialState();
		}, FIRST_RENDER_RESTORE_FALLBACK_MS);

		const restartTerminal = () => {
			isExitedRef.current = false;
			isStreamReadyRef.current = false;
			wasKilledByUserRef.current = false;
			setExitStatus(null);
			clearTerminalKilledByUser(paneId);
			isAlternateScreenRef.current = false; // Reset for new shell
			isBracketedPasteRef.current = false;
			modeScanBufferRef.current = "";
			xterm.clear();
			createOrAttachRef.current(
				{
					paneId,
					tabId: parentTabIdRef.current || paneId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
					allowKilled: true,
				},
				{
					onSuccess: (result) => {
						pendingInitialStateRef.current = result;
						maybeApplyInitialState();
					},
					onError: (error) => {
						console.error("[Terminal] Failed to restart:", error);
						setConnectionError(error.message || "Failed to restart terminal");
						isStreamReadyRef.current = true;
						flushPendingEvents();
					},
				},
			);
		};
		restartTerminalRef.current = restartTerminal;

		const handleTerminalInput = (data: string) => {
			// When overlays are visible, ignore input completely:
			// - Cold restore overlay: no live session yet
			// - Connection error overlay: daemon may be unavailable
			if (isRestoredModeRef.current || connectionErrorRef.current) {
				return;
			}
			if (isExitedRef.current) {
				if (!isFocusedRef.current || wasKilledByUserRef.current) {
					return;
				}
				restartTerminal();
				return;
			}
			writeRef.current({ paneId, data });
		};

		const handleKeyPress = (event: {
			key: string;
			domEvent: KeyboardEvent;
		}) => {
			// Don't treat overlay interactions as terminal typing.
			if (isRestoredModeRef.current || connectionErrorRef.current) {
				return;
			}
			const { domEvent } = event;
			if (domEvent.key === "Enter") {
				// Don't auto-title from keyboard when in alternate screen (TUI apps like vim, codex)
				// TUI apps set their own title via escape sequences handled by onTitleChange
				// Use our own tracking (isAlternateScreenRef) because xterm.buffer.active.type
				// is unreliable after HMR or recovery - the new xterm instance doesn't know
				// about escape sequences that were sent before it was created.
				if (!isAlternateScreenRef.current) {
					const title = sanitizeForTitle(commandBufferRef.current);
					if (title && parentTabIdRef.current) {
						debouncedSetTabAutoTitleRef.current(parentTabIdRef.current, title);
					}
				}
				commandBufferRef.current = "";
			} else if (domEvent.key === "Backspace") {
				commandBufferRef.current = commandBufferRef.current.slice(0, -1);
			} else if (domEvent.key === "c" && domEvent.ctrlKey) {
				commandBufferRef.current = "";
				// Ctrl+C interrupts agent - clear working/permission status
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (domEvent.key === "Escape") {
				// ESC interrupts agent (e.g., Claude Code "stop generating") - clear status
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (
				domEvent.key.length === 1 &&
				!domEvent.ctrlKey &&
				!domEvent.metaKey
			) {
				commandBufferRef.current += domEvent.key;
			}
		};

		const initialCommands = paneInitialCommandsRef.current;
		const initialCwd = paneInitialCwdRef.current;

		const cancelInitialAttach = scheduleTerminalAttach({
			paneId,
			priority: isFocusedRef.current ? 0 : 1,
			run: (done) => {
				if (isTerminalKilledByUser(paneId)) {
					wasKilledByUserRef.current = true;
					isExitedRef.current = true;
					isStreamReadyRef.current = false;
					setExitStatus("killed");
					done();
					return;
				}
				if (DEBUG_TERMINAL) {
					console.log(`[Terminal] createOrAttach start: ${paneId}`);
				}
				const createOrAttachStartTime = Date.now();
				createOrAttachRef.current(
					{
						paneId,
						tabId: parentTabIdRef.current || paneId,
						workspaceId,
						cols: xterm.cols,
						rows: xterm.rows,
						initialCommands,
						cwd: initialCwd,
					},
					{
						onSuccess: (result) => {
							// Clear any connection error from previous daemon loss
							setConnectionError(null);

							if (DEBUG_TERMINAL) {
								console.log(
									`[Terminal] createOrAttach success: ${paneId} (${Date.now() - createOrAttachStartTime}ms)`,
									{
										isNew: result.isNew,
										wasRecovered: result.wasRecovered,
										isColdRestore: result.isColdRestore,
										snapshotBytes: result.snapshot?.snapshotAnsi?.length ?? 0,
									},
								);
							}
							// Clear after successful creation to prevent re-running on future reattach
							if (initialCommands || initialCwd) {
								clearPaneInitialDataRef.current(paneId);
							}

							// FIRST: Check if we have stored cold restore state from a previous mount
							// (StrictMode causes unmount/remount - check this BEFORE result.isColdRestore
							// because the second mount's result won't have isColdRestore=true)
							const storedColdRestore = coldRestoreState.get(paneId);
							if (storedColdRestore?.isRestored) {
								setIsRestoredMode(true);
								setRestoredCwd(storedColdRestore.cwd);

								// Write scrollback to terminal as read-only display
								if (storedColdRestore.scrollback && xterm) {
									xterm.write(storedColdRestore.scrollback);
								}

								// Mark first render complete but don't enable streaming
								didFirstRenderRef.current = true;
								return;
							}

							// Handle cold restore (reboot recovery) - first detection
							// Store in module-level map to survive StrictMode remount
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

								// Write scrollback to terminal as read-only display
								if (scrollback && xterm) {
									xterm.write(scrollback);
								}

								// Mark first render complete but don't enable streaming
								// (shell isn't running - user must click Start Shell)
								didFirstRenderRef.current = true;
								return;
							}

							// Defer initial state restoration until xterm has rendered once.
							// Streaming is enabled only after restoration is queued into xterm.
							pendingInitialStateRef.current = result;
							maybeApplyInitialState();
						},
						onError: (error) => {
							if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
								wasKilledByUserRef.current = true;
								isExitedRef.current = true;
								isStreamReadyRef.current = false;
								setExitStatus("killed");
								setConnectionError(null);
								return;
							}
							if (DEBUG_TERMINAL) {
								console.log(
									`[Terminal] createOrAttach error: ${paneId}`,
									error.message,
								);
							}
							console.error("[Terminal] Failed to create/attach:", error);
							setConnectionError(
								error.message || "Failed to connect to terminal",
							);
							isStreamReadyRef.current = true;
							flushPendingEvents();
						},
						onSettled: () => {
							done();
						},
					},
				);
			},
		});

		const inputDisposable = xterm.onData(handleTerminalInput);
		const keyDisposable = xterm.onKey(handleKeyPress);

		const titleDisposable = xterm.onTitleChange((title) => {
			if (title && parentTabIdRef.current) {
				debouncedSetTabAutoTitleRef.current(parentTabIdRef.current, title);
			}
		});

		const handleClear = () => {
			xterm.clear();
			clearScrollbackRef.current({ paneId });
		};

		const handleScrollToBottom = () => {
			scrollToBottom(xterm);
		};

		const handleWrite = (data: string) => {
			if (isExitedRef.current) {
				return;
			}
			writeRef.current({ paneId, data });
		};

		const cleanupKeyboard = setupKeyboardHandler(xterm, {
			onShiftEnter: () => handleWrite("\x1b\r"), // ESC + CR for line continuation without '\'
			onClear: handleClear,
		});

		// Setup click-to-move cursor (click on prompt line to move cursor)
		const cleanupClickToMove = setupClickToMoveCursor(xterm, {
			onWrite: handleWrite,
		});

		// Register clear callback for context menu access
		registerClearCallbackRef.current(paneId, handleClear);

		// Register scroll to bottom callback for context menu access
		registerScrollToBottomCallbackRef.current(paneId, handleScrollToBottom);

		const cleanupFocus = setupFocusListener(xterm, () =>
			handleTerminalFocusRef.current(),
		);
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ paneId, cols, rows });
			},
		);
		const cleanupPaste = setupPasteHandler(xterm, {
			onPaste: (text) => {
				commandBufferRef.current += text;
			},
			onWrite: handleWrite,
			isBracketedPasteEnabled: () => isBracketedPasteRef.current,
		});

		// Fix WebGL texture atlas corruption when app returns from background.
		// The WebGL renderer caches glyphs in a texture atlas for performance. When the app
		// is backgrounded, the WebGL context can be invalidated, leaving stale/corrupt glyphs
		// in the atlas. Clearing the atlas and forcing a full refresh rebuilds glyphs from
		// the (correct) terminal buffer, "healing" the display.
		//
		// We need BOTH visibilitychange AND window.focus handlers because:
		// - visibilitychange: Fires when document becomes hidden/visible (minimize, switch apps)
		// - window.focus: Fires on window blur/focus which may NOT trigger visibilitychange
		//   in Electron (e.g., alt-tab where window loses focus but document isn't "hidden")
		//
		// A debounce prevents double-refresh when both events fire in quick succession.
		let lastRefreshTime = 0;
		const REFRESH_DEBOUNCE_MS = 100;

		const refreshTerminalDisplay = () => {
			if (isUnmounted) return;

			// Debounce: skip if we just refreshed (e.g., both events fired together)
			const now = Date.now();
			if (now - lastRefreshTime < REFRESH_DEBOUNCE_MS) return;
			lastRefreshTime = now;

			// Capture dimensions before fit() to detect if resize occurred while backgrounded
			const prevCols = xterm.cols;
			const prevRows = xterm.rows;
			fitAddon.fit();

			// If dimensions changed (e.g., DPI/layout change while backgrounded), sync PTY
			if (xterm.cols !== prevCols || xterm.rows !== prevRows) {
				resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
			}

			const currentRenderer = rendererRef.current?.current;
			if (currentRenderer?.kind === "webgl") {
				currentRenderer.clearTextureAtlas?.();
			}
			if (xterm.rows > 0) {
				xterm.refresh(0, xterm.rows - 1);
			}
		};

		const handleVisibilityChange = () => {
			if (document.hidden) return;
			refreshTerminalDisplay();
		};

		const handleWindowFocus = () => {
			refreshTerminalDisplay();
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", handleWindowFocus);

		return () => {
			if (DEBUG_TERMINAL) {
				console.log(`[Terminal] Unmount: ${paneId}`);
			}
			cancelInitialAttach();
			isUnmounted = true;
			firstStreamDataReceivedRef.current = false;
			if (firstRenderFallback) {
				clearTimeout(firstRenderFallback);
			}
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", handleWindowFocus);
			inputDisposable.dispose();
			keyDisposable.dispose();
			titleDisposable.dispose();
			cleanupKeyboard();
			cleanupClickToMove();
			cleanupFocus?.();
			cleanupResize();
			cleanupPaste();
			cleanupQuerySuppression();
			unregisterClearCallbackRef.current(paneId);
			unregisterScrollToBottomCallbackRef.current(paneId);
			debouncedSetTabAutoTitleRef.current?.cancel?.();

			// Debounce detach to handle React StrictMode's unmount/remount cycle.
			// If the component remounts quickly (as in StrictMode), the new mount will
			// cancel this timeout, preventing the detach from corrupting terminal state.
			const detachTimeout = setTimeout(() => {
				detachRef.current({
					paneId,
					viewportY: getScrollOffsetFromBottom(xterm),
				});
				pendingDetaches.delete(paneId);
				// Clean up cold restore scrollback to prevent memory leak
				// (scrollback can be MBs per pane, accumulates if not cleaned)
				// Must be inside detachTimeout to survive StrictMode unmount/remount
				coldRestoreState.delete(paneId);
			}, 50);
			pendingDetaches.set(paneId, detachTimeout);

			isStreamReadyRef.current = false;
			didFirstRenderRef.current = false;
			pendingInitialStateRef.current = null;
			isAlternateScreenRef.current = false;
			isBracketedPasteRef.current = false;
			modeScanBufferRef.current = "";
			renderDisposableRef.current?.dispose();
			renderDisposableRef.current = null;

			// Delay xterm.dispose() to let internal timeouts complete.
			// xterm.open() schedules a setTimeout for Viewport.syncScrollArea.
			// If we dispose synchronously, that timeout fires after _renderer is
			// cleared, causing "Cannot read properties of undefined (reading 'dimensions')".
			// Using setTimeout(0) ensures our dispose runs after xterm's internal callback.
			setTimeout(() => {
				xterm.dispose();
			}, 0);

			xtermRef.current = null;
			searchAddonRef.current = null;
			rendererRef.current = null;
			setXtermInstance(null);
		};
	}, [
		paneId,
		workspaceId,
		flushPendingEvents,
		maybeApplyInitialState,
		setConnectionError,
	]);

	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();

		const files = Array.from(event.dataTransfer.files);
		if (files.length === 0) return;

		// Use Electron's webUtils API to access file paths in context-isolated renderer process
		const paths = files.map((file) => window.webUtils.getPathForFile(file));
		const text = shellEscapePaths(paths);

		if (!isExitedRef.current) {
			writeRef.current({ paneId, data: text });
		}
	};

	const handleRestartSession = useCallback(() => {
		restartTerminalRef.current();
	}, []);

	return (
		<div
			role="application"
			className="relative h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<TerminalSearch
				searchAddon={searchAddonRef.current}
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
			/>
			<ScrollToBottomButton terminal={xtermInstance} />
			{exitStatus === "killed" && !connectionError && !isRestoredMode && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
					<Card className="gap-3 py-4 px-2">
						<div className="flex flex-col items-center text-center gap-1.5 px-4">
							<LuPower className="size-5 text-muted-foreground" />
							<div className="space-y-0.5">
								<p className="text-sm font-medium">Session killed</p>
								<p className="text-xs text-muted-foreground">
									You terminated this shell session
								</p>
							</div>
						</div>
						<div className="px-4">
							<Button
								size="sm"
								className="w-full"
								onClick={handleRestartSession}
							>
								Restart
							</Button>
						</div>
					</Card>
				</div>
			)}
			{connectionError && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
					<Card className="gap-3 py-4 px-2 max-w-xs">
						<div className="flex flex-col items-center text-center gap-1.5 px-4">
							<HiExclamationTriangle className="size-5 text-destructive" />
							<div className="space-y-0.5">
								<p className="text-sm font-medium">Connection error</p>
								<p className="text-xs text-muted-foreground">
									Lost connection to terminal daemon
								</p>
							</div>
						</div>
						<div className="px-4">
							<Button
								size="sm"
								className="w-full"
								onClick={handleRetryConnection}
							>
								Retry
							</Button>
						</div>
					</Card>
				</div>
			)}
			{isRestoredMode && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
					<Card className="gap-3 py-4 px-2">
						<div className="flex flex-col items-center text-center gap-1.5 px-4">
							<LuTerminal className="size-5 text-primary" />
							<div className="space-y-0.5">
								<p className="text-sm font-medium">Session restored</p>
								<p className="text-xs text-muted-foreground">
									Previous scrollback preserved after restart
								</p>
							</div>
						</div>
						<div className="px-4">
							<Button size="sm" className="w-full" onClick={handleStartShell}>
								Start Shell
							</Button>
						</div>
					</Card>
				</div>
			)}
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};
