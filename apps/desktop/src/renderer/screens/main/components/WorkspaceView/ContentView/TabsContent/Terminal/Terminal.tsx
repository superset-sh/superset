import { toast } from "@superset/ui/sonner";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Terminal as XTerm } from "@xterm/xterm";
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
} from "./helpers";
import { parseCwd } from "./parseCwd";
import { TerminalSearch } from "./TerminalSearch";
import type { TerminalProps, TerminalStreamEvent } from "./types";
import { shellEscapePaths } from "./utils";

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
	const serializeAddonRef = useRef<SerializeAddon | null>(null);
	const isExitedRef = useRef(false);
	const commandBufferRef = useRef("");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [cwdConfirmed, setCwdConfirmed] = useState(false);
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

	// Ref for initial theme to avoid recreating terminal on theme change
	const initialThemeRef = useRef(terminalTheme);

	const isFocused = focusedPaneId === paneId;

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

	const handleStreamData = (event: TerminalStreamEvent) => {
		if (!xtermRef.current) {
			return;
		}

		if (event.type === "data") {
			xtermRef.current.write(event.data);
			updateCwdFromData(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			xtermRef.current.writeln(
				`\r\n\r\n[Process exited with code ${event.exitCode}]`,
			);
			xtermRef.current.writeln("[Press any key to restart]");

			// Clear transient pane status on terminal exit
			// "working" and "permission" should clear (agent no longer active)
			// "review" should persist (user needs to see completed work)
			// Use store getter to get fresh pane status at event time (not stale closure)
			const currentPane = useTabsStore.getState().panes[paneId];
			if (
				currentPane?.status === "working" ||
				currentPane?.status === "permission"
			) {
				setPaneStatus(paneId, "idle");
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

	useAppHotkey(
		"SCROLL_TO_BOTTOM",
		() => {
			xtermRef.current?.scrollToBottom();
		},
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		let isUnmounted = false;

		const {
			xterm,
			fitAddon,
			serializeAddon,
			cleanup: cleanupQuerySuppression,
		} = createTerminalInstance(container, {
			cwd: workspaceCwd,
			initialTheme: initialThemeRef.current,
			onFileLinkClick: (path, line, column) =>
				handleFileLinkClickRef.current(path, line, column),
		});
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		serializeAddonRef.current = serializeAddon;
		isExitedRef.current = false;

		if (isFocusedRef.current) {
			xterm.focus();
		}

		import("@xterm/addon-search").then(({ SearchAddon }) => {
			if (isUnmounted) return;
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		});

		const applySerializedState = (serializedState: string) => {
			if (serializedState) {
				xterm.write(serializedState);
			}
		};

		const restartTerminal = () => {
			isExitedRef.current = false;
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
						applySerializedState(result.serializedState);
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
				const title = sanitizeForTitle(commandBufferRef.current);
				if (title && parentTabIdRef.current) {
					debouncedSetTabAutoTitleRef.current(parentTabIdRef.current, title);
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
					applySerializedState(result.serializedState);
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

		const handleScrollToBottom = () => {
			xterm.scrollToBottom();
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
		});

		return () => {
			isUnmounted = true;
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

			const serializedState = serializeAddon.serialize();

			// Detach instead of kill to keep PTY running for reattachment
			detachRef.current({ paneId, serializedState });
			xterm.dispose();
			xtermRef.current = null;
			searchAddonRef.current = null;
			serializeAddonRef.current = null;
		};
	}, [paneId, workspaceId, workspaceCwd]);

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
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};
