import { toast } from "@superset/ui/sonner";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { IDisposable, Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { trpcClient } from "renderer/lib/trpc-client";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import { useTerminalTheme } from "renderer/stores/theme";
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
import { parseCwd } from "./parseCwd";
import { TerminalSearch } from "./TerminalSearch";
import type { TerminalProps, TerminalStreamEvent } from "./types";
import { shellEscapePaths } from "./utils";

const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// Module-level map to track pending detach timeouts.
// This survives React StrictMode's unmount/remount cycle, allowing us to
// cancel a pending detach if the component immediately remounts.
const pendingDetaches = new Map<string, NodeJS.Timeout>();

type CreateOrAttachResult = {
	wasRecovered: boolean;
	isNew: boolean;
	scrollback: string;
	snapshot?: {
		snapshotAnsi: string;
		rehydrateSequences: string;
		cwd: string | null;
		modes: Record<string, boolean>;
		cols: number;
		rows: number;
		scrollbackLines: number;
	};
};

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const paneId = tabId;
	const panes = useTabsStore((s) => s.panes);
	const pane = panes[paneId];
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
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const commandBufferRef = useRef("");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [cwdConfirmed, setCwdConfirmed] = useState(false);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const updatePaneCwd = useTabsStore((s) => s.updatePaneCwd);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const terminalTheme = useTerminalTheme();

	// Ref for initial theme to avoid recreating terminal on theme change
	const initialThemeRef = useRef(terminalTheme);

	const isFocused = pane?.tabId ? focusedPaneIds[pane.tabId] === paneId : false;

	// Gate streaming until initial state restoration is applied to avoid interleaving output.
	const isStreamReadyRef = useRef(false);

	// Gate restoration until xterm has rendered at least once (renderer/viewport ready).
	const didFirstRenderRef = useRef(false);
	const pendingInitialStateRef = useRef<CreateOrAttachResult | null>(null);
	const renderDisposableRef = useRef<IDisposable | null>(null);
	const restoreSequenceRef = useRef(0);

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

	const { data: workspaceCwd } =
		trpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	// Use ref for workspaceCwd to avoid terminal recreation when query loads
	// (changing from undefined→string triggers useEffect, causing xterm errors)
	const workspaceCwdRef = useRef(workspaceCwd);
	workspaceCwdRef.current = workspaceCwd;

	// Query terminal link behavior setting
	const { data: terminalLinkBehavior } =
		trpc.settings.getTerminalLinkBehavior.useQuery();

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
						toast.error("Failed to open file in editor", {
							description: path,
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

	// Sync terminal cwd to store for DirectoryNavigator
	useEffect(() => {
		updatePaneCwd(paneId, terminalCwd, cwdConfirmed);
	}, [terminalCwd, cwdConfirmed, paneId, updatePaneCwd]);

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

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();
	const clearScrollbackMutation = trpc.terminal.clearScrollback.useMutation();

	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);
	const clearScrollbackRef = useRef(clearScrollbackMutation.mutate);
	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;
	clearScrollbackRef.current = clearScrollbackMutation.mutate;

	const registerClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerClearCallback,
	);
	const unregisterClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterClearCallback,
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
				isExitedRef.current = true;
				isStreamReadyRef.current = false;
				xterm.writeln(`\r\n\r\n[Process exited with code ${event.exitCode}]`);
				xterm.writeln("[Press any key to restart]");
			} else if (event.type === "disconnect") {
				setConnectionError(
					event.reason || "Connection to terminal daemon lost",
				);
			} else if (event.type === "error") {
				const message = event.code
					? `${event.code}: ${event.error}`
					: event.error;
				console.warn("[Terminal] stream error:", message);

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
	}, []);

	const maybeApplyInitialState = useCallback(() => {
		if (!didFirstRenderRef.current) return;
		const result = pendingInitialStateRef.current;
		if (!result) return;

		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!xterm || !fitAddon) return;

		// Clear before applying to prevent double-apply on concurrent triggers.
		pendingInitialStateRef.current = null;
		const restoreSequence = ++restoreSequenceRef.current;

		try {
			// Track alternate screen mode from snapshot for our own reference
			// (xterm.buffer.active.type is unreliable after HMR/recovery)
			isAlternateScreenRef.current = !!result.snapshot?.modes.alternateScreen;
			isBracketedPasteRef.current = !!result.snapshot?.modes.bracketedPaste;
			modeScanBufferRef.current = "";

			// Also parse scrollback for escape sequences in case snapshot.modes is incomplete
			// This handles cases where the daemon didn't track the mode but the sequences are in history
			if (result.scrollback) {
				const hasEnterAlt =
					result.scrollback.includes("\x1b[?1049h") ||
					result.scrollback.includes("\x1b[?47h");
				const hasExitAlt =
					result.scrollback.includes("\x1b[?1049l") ||
					result.scrollback.includes("\x1b[?47l");
				// If we see enter without exit, we're likely in alternate screen
				if (hasEnterAlt && !hasExitAlt) {
					isAlternateScreenRef.current = true;
				}

				// Bracketed paste mode can toggle during a session - use the last seen state.
				const bracketEnableIndex = result.scrollback.lastIndexOf("\x1b[?2004h");
				const bracketDisableIndex =
					result.scrollback.lastIndexOf("\x1b[?2004l");
				if (bracketEnableIndex !== -1 || bracketDisableIndex !== -1) {
					isBracketedPasteRef.current =
						bracketEnableIndex > bracketDisableIndex;
				}
			}

			// If session was in alternate screen mode, enter it BEFORE writing content.
			// rehydrateSequences intentionally excludes alternate screen mode (1049) because
			// sending it after content would clear the screen. We must send it first so xterm
			// knows to use the alternate buffer, then write content into it.
			if (result.snapshot?.modes.alternateScreen) {
				xterm.write("\x1b[?1049h");
			}

			// Apply rehydration sequences to restore other terminal modes
			// (app cursor mode, bracketed paste, mouse tracking, etc.)
			if (result.snapshot?.rehydrateSequences) {
				xterm.write(result.snapshot.rehydrateSequences);
			}

			// xterm.write() is asynchronous - escape sequences may not be fully
			// processed when the terminal first renders, causing garbled display.
			// Force a re-render after write completes to ensure correct display.
			// (Symptom: restored terminals show corrupted text until resized)
			// Use fitAddon.fit() and (when using WebGL) clear the glyph atlas to force a full repaint.
			xterm.write(result.scrollback, () => {
				const redraw = () => {
					requestAnimationFrame(() => {
						try {
							if (restoreSequenceRef.current !== restoreSequence) return;
							if (xtermRef.current !== xterm) return;

							fitAddon.fit();
							if (xtermRef.current !== xterm) return;

							// Reattached sessions can sometimes render partially until the user resizes the pane.
							// WebGL off fully fixes this, which strongly suggests a WebGL texture-atlas repaint bug.
							// Clearing the atlas forces xterm-webgl to rebuild glyphs and repaint without a resize nudge.
							const cols = xterm.cols;
							const rows = xterm.rows;
							if (cols <= 0 || rows <= 0) return;

							// Keep PTY dimensions in sync even when FitAddon doesn't change cols/rows.
							resizeRef.current({ paneId, cols, rows });

							if (!result.isNew) {
								const renderer = rendererRef.current?.current;
								if (renderer?.kind === "webgl") {
									// Clear twice: once immediately, and once after fonts settle.
									// This reduces restore artifacts (especially for TUIs like opencode)
									// and prevents stale glyphs when fonts swap in.
									renderer.clearTextureAtlas?.();
								}
							}
							xterm.refresh(0, rows - 1);
						} catch (error) {
							console.warn(
								"[Terminal] redraw() failed after restoration:",
								error,
							);
						}
					});
				};

				// Redraw once immediately, and once again after fonts settle.
				redraw();
				void document.fonts?.ready.then(() => {
					if (restoreSequenceRef.current !== restoreSequence) return;
					if (xtermRef.current !== xterm) return;
					redraw();
				});
			});
			updateCwdRef.current(result.scrollback);
		} catch (error) {
			console.error("[Terminal] Restoration failed:", error);
		}

		// Enable streaming after initial state has been queued into xterm's write buffer.
		isStreamReadyRef.current = true;
		flushPendingEvents();
	}, [flushPendingEvents, paneId]);

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
					setConnectionError(null);
					pendingInitialStateRef.current = result;
					maybeApplyInitialState();
				},
				onError: (error) => {
					setConnectionError(error.message || "Connection failed");
					isStreamReadyRef.current = true;
					flushPendingEvents();
				},
			},
		);
	}, [paneId, workspaceId, maybeApplyInitialState, flushPendingEvents]);

	const handleStreamData = (event: TerminalStreamEvent) => {
		// Queue events until terminal is ready to prevent data loss
		if (!xtermRef.current || !isStreamReadyRef.current) {
			pendingEventsRef.current.push(event);
			return;
		}

		if (event.type === "data") {
			updateModesFromDataRef.current(event.data);
			xtermRef.current.write(event.data);
			updateCwdFromData(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			isStreamReadyRef.current = false;
			xtermRef.current.writeln(
				`\r\n\r\n[Process exited with code ${event.exitCode}]`,
			);
			xtermRef.current.writeln("[Press any key to restart]");
		} else if (event.type === "disconnect") {
			// Daemon connection lost - show error UI with retry option
			setConnectionError(event.reason || "Connection to terminal daemon lost");
		} else if (event.type === "error") {
			const message = event.code
				? `${event.code}: ${event.error}`
				: event.error;
			console.warn("[Terminal] stream error:", message);

			toast.error("Terminal error", {
				description: message,
			});

			if (event.code === "WRITE_QUEUE_FULL" || event.code === "WRITE_FAILED") {
				xtermRef.current.writeln(`\r\n[Terminal] ${message}`);
			} else {
				setConnectionError(message);
			}
		}
	};

	trpc.terminal.stream.useSubscription(paneId, {
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
		if (isFocused && xtermRef.current) {
			xtermRef.current.focus();
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

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

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
			cwd: workspaceCwdRef.current,
			initialTheme: initialThemeRef.current,
			onFileLinkClick: (path, line, column) =>
				handleFileLinkClickRef.current(path, line, column),
		});
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		rendererRef.current = renderer;
		isExitedRef.current = false;
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

		const handleTerminalInput = (data: string) => {
			if (isExitedRef.current) {
				restartTerminal();
				return;
			}
			writeRef.current({ paneId, data });
		};

		const handleKeyPress = (event: {
			key: string;
			domEvent: KeyboardEvent;
		}) => {
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
					// Clear after successful creation to prevent re-running on future reattach
					if (initialCommands || initialCwd) {
						clearPaneInitialDataRef.current(paneId);
					}
					// Defer initial state restoration until xterm has rendered once.
					// Streaming is enabled only after restoration is queued into xterm.
					pendingInitialStateRef.current = result;
					maybeApplyInitialState();
				},
				onError: (error) => {
					console.error("[Terminal] Failed to create/attach:", error);
					setConnectionError(error.message || "Failed to connect to terminal");
					isStreamReadyRef.current = true;
					flushPendingEvents();
				},
			},
		);

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

		const handleWrite = (data: string) => {
			if (!isExitedRef.current) {
				writeRef.current({ paneId, data });
			}
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

		return () => {
			isUnmounted = true;
			if (firstRenderFallback) {
				clearTimeout(firstRenderFallback);
			}
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
			debouncedSetTabAutoTitleRef.current?.cancel?.();

			// Debounce detach to handle React StrictMode's unmount/remount cycle.
			// If the component remounts quickly (as in StrictMode), the new mount will
			// cancel this timeout, preventing the detach from corrupting terminal state.
			const detachTimeout = setTimeout(() => {
				detachRef.current({ paneId });
				pendingDetaches.delete(paneId);
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
		};
	}, [paneId, workspaceId, flushPendingEvents, maybeApplyInitialState]);

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
			{connectionError && (
				<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80">
					<div className="mb-4 px-4 text-center text-red-400">
						<p className="font-semibold">Connection Error</p>
						<p className="mt-1 text-sm text-gray-400">{connectionError}</p>
					</div>
					<button
						type="button"
						onClick={handleRetryConnection}
						className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
					>
						Retry Connection
					</button>
				</div>
			)}
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};
