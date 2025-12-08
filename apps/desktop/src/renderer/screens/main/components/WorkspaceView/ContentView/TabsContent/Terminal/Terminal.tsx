import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalTheme } from "renderer/stores/theme";
import { HOTKEYS } from "shared/hotkeys";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
} from "./helpers";
import { parseTerminalMetadata } from "./parseTerminalMetadata";
import { TerminalSearch } from "./TerminalSearch";
import type { TerminalProps, TerminalStreamEvent } from "./types";
import { shellEscapePaths } from "./utils";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	// tabId is actually paneId in the new model
	const paneId = tabId;
	const panes = useTabsStore((s) => s.panes);
	const pane = panes[paneId];
	const paneName = pane?.name || "Terminal";
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [terminalVenvs, setTerminalVenvs] = useState<string[]>([]);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const updatePaneName = useTabsStore((s) => s.updatePaneName);
	const updatePaneVenvs = useTabsStore((s) => s.updatePaneVenvs);
	const updatePaneCwd = useTabsStore((s) => s.updatePaneCwd);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const terminalTheme = useTerminalTheme();

	// Check if this terminal is the focused pane in its tab
	const isFocused = pane?.tabId ? focusedPaneIds[pane.tabId] === paneId : false;

	// Ref to track focus state for use in terminal creation effect
	const isFocusedRef = useRef(isFocused);
	isFocusedRef.current = isFocused;

	// Required for resolving relative file paths in terminal commands
	const { data: workspaceCwd } =
		trpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	// Initialize cwd from workspace path (fallback before shell emits OSC 7)
	useEffect(() => {
		if (workspaceCwd && !terminalCwd) {
			setTerminalCwd(workspaceCwd);
		}
	}, [workspaceCwd, terminalCwd]);

	// Update pane name and cwd with current directory for mosaic window
	useEffect(() => {
		if (terminalCwd) {
			const parts = terminalCwd.split("/").filter(Boolean);
			const basename = parts[parts.length - 1] || "Terminal";
			updatePaneName(paneId, basename);
			updatePaneCwd(paneId, terminalCwd);
		}
	}, [terminalCwd, paneId, updatePaneName, updatePaneCwd]);

	// Update pane venvs for mosaic window toolbar display
	useEffect(() => {
		updatePaneVenvs(paneId, terminalVenvs);
	}, [terminalVenvs, paneId, updatePaneVenvs]);

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	// Avoid effect re-runs when mutations change
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);

	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;

	// Parse terminal data for metadata (cwd, venvs)
	const updateMetadataFromData = useCallback((data: string) => {
		const metadata = parseTerminalMetadata(data);
		if (metadata.cwd !== null) {
			setTerminalCwd(metadata.cwd);
		}
		if (metadata.venvs.length > 0) {
			setTerminalVenvs((prev) => {
				// Merge new venvs with existing ones, keeping unique values
				const merged = new Set([...prev, ...metadata.venvs]);
				return Array.from(merged);
			});
		}
	}, []);

	// Ref to use metadata parser inside effect
	const updateMetadataRef = useRef(updateMetadataFromData);
	updateMetadataRef.current = updateMetadataFromData;

	const handleStreamData = (event: TerminalStreamEvent) => {
		if (!xtermRef.current) {
			// Prevent data loss during terminal initialization
			pendingEventsRef.current.push(event);
			return;
		}

		// Prevent race condition where events arrive before scrollback recovery completes
		if (!subscriptionEnabled) {
			pendingEventsRef.current.push(event);
			return;
		}

		if (event.type === "data") {
			xtermRef.current.write(event.data);
			updateMetadataFromData(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			setSubscriptionEnabled(false);
			xtermRef.current.writeln(
				`\r\n\r\n[Process exited with code ${event.exitCode}]`,
			);
			xtermRef.current.writeln("[Press any key to restart]");
		}
	};

	// Use paneId (tabId) for stream subscription
	trpc.terminal.stream.useSubscription(paneId, {
		onData: handleStreamData,
		// Always listen to prevent missing events during initialization
		enabled: true,
	});

	// Handler to set focused pane when terminal gains focus
	// Use ref to avoid triggering full terminal recreation when focus handler changes
	const handleTerminalFocusRef = useRef(() => {});
	handleTerminalFocusRef.current = () => {
		if (pane?.tabId) {
			setFocusedPane(pane.tabId, paneId);
		}
	};

	// Auto-close search when terminal loses focus
	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
		}
	}, [isFocused]);

	// Autofocus terminal when it becomes the focused pane (e.g., after split)
	useEffect(() => {
		if (isFocused && xtermRef.current) {
			xtermRef.current.focus();
		}
	}, [isFocused]);

	// Toggle search with Cmd+F (only for the focused terminal)
	useHotkeys(
		HOTKEYS.FIND_IN_TERMINAL.keys,
		() => {
			setIsSearchOpen((prev) => !prev);
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
			cleanup: cleanupQuerySuppression,
		} = createTerminalInstance(container, workspaceCwd, terminalTheme);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;

		// Autofocus on initial render if this terminal is the focused pane
		if (isFocusedRef.current) {
			xterm.focus();
		}

		// Load search addon for Cmd+F functionality
		import("@xterm/addon-search").then(({ SearchAddon }) => {
			if (isUnmounted) return;
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		});

		// Delay enabling subscription to ensure scrollback is applied first, preventing duplicate output

		const flushPendingEvents = () => {
			if (pendingEventsRef.current.length === 0) return;
			const events = pendingEventsRef.current.splice(
				0,
				pendingEventsRef.current.length,
			);
			for (const event of events) {
				if (event.type === "data") {
					xterm.write(event.data);
					updateMetadataRef.current(event.data);
				} else {
					isExitedRef.current = true;
					setSubscriptionEnabled(false);
					xterm.writeln(`\r\n\r\n[Process exited with code ${event.exitCode}]`);
					xterm.writeln("[Press any key to restart]");
				}
			}
		};

		const applyInitialState = (result: {
			wasRecovered: boolean;
			isNew: boolean;
			scrollback: string;
			venv: string | null;
		}) => {
			xterm.write(result.scrollback);
			updateMetadataRef.current(result.scrollback);
			// Set venv from environment detection (adds to existing venvs)
			const venv = result.venv;
			if (venv) {
				setTerminalVenvs((prev) => {
					if (prev.includes(venv)) return prev;
					return [...prev, venv];
				});
			}
		};

		const restartTerminal = () => {
			isExitedRef.current = false;
			setSubscriptionEnabled(false);
			xterm.clear();
			createOrAttachRef.current(
				{
					tabId: paneId,
					workspaceId,
					tabTitle: paneName,
					cols: xterm.cols,
					rows: xterm.rows,
				},
				{
					onSuccess: (result) => {
						applyInitialState(result);
						setSubscriptionEnabled(true);
						flushPendingEvents();
					},
					onError: () => {
						setSubscriptionEnabled(true);
					},
				},
			);
		};

		const handleTerminalInput = (data: string) => {
			if (isExitedRef.current) {
				restartTerminal();
			} else {
				writeRef.current({ tabId: paneId, data });
			}
		};

		createOrAttachRef.current(
			{
				tabId: paneId,
				workspaceId,
				tabTitle: paneName,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result) => {
					// Avoid duplication when pending events already contain scrollback data
					const hasPendingEvents = pendingEventsRef.current.length > 0;
					if (result.isNew || !hasPendingEvents) {
						applyInitialState(result);
					} else {
						// Still apply venv even if not applying scrollback
						const venv = result.venv;
						if (venv) {
							setTerminalVenvs((prev) => {
								if (prev.includes(venv)) return prev;
								return [...prev, venv];
							});
						}
					}
					setSubscriptionEnabled(true);
					flushPendingEvents();
				},
				onError: () => {
					setSubscriptionEnabled(true);
				},
			},
		);

		const inputDisposable = xterm.onData(handleTerminalInput);

		// Intercept keyboard events to handle app hotkeys and provide iTerm-like line continuation UX
		const cleanupKeyboard = setupKeyboardHandler(xterm, {
			onShiftEnter: () => {
				if (!isExitedRef.current) {
					// Use shell's native continuation syntax to avoid shell-specific parsing
					writeRef.current({ tabId: paneId, data: "\\\n" });
				}
			},
			onClear: () => {
				xterm.clear();
			},
		});

		// Setup focus listener to track focused pane (use ref to get latest handler)
		const cleanupFocus = setupFocusListener(xterm, () =>
			handleTerminalFocusRef.current(),
		);
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ tabId: paneId, cols, rows });
			},
		);
		// Setup paste handler to ensure bracketed paste mode works for TUI apps like opencode
		const cleanupPaste = setupPasteHandler(xterm);

		return () => {
			isUnmounted = true;
			inputDisposable.dispose();
			cleanupKeyboard();
			cleanupFocus?.();
			cleanupResize();
			cleanupPaste();
			cleanupQuerySuppression();
			// Keep PTY running for reattachment
			detachRef.current({ tabId: paneId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
			searchAddonRef.current = null;
		};
	}, [paneId, workspaceId, workspaceCwd, paneName, terminalTheme]);

	// Sync theme changes to xterm instance for live theme switching
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;

		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	// Match container background to terminal theme for seamless visual integration
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
			writeRef.current({ tabId: paneId, data: text });
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
