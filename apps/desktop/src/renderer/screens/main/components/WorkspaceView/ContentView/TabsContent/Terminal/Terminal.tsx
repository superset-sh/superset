import type { FitAddon, Terminal as XTerm } from "ghostty-web";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalTheme } from "renderer/stores/theme";
import { SessionKilledOverlay } from "./components";
import { DEFAULT_TERMINAL_FONT_SIZE } from "./config";
import { preloadTerminalFonts, resolveTerminalFontFamily } from "./font-family";
import { ensureGhosttyRuntime } from "./ghostty-runtime";
import { getDefaultTerminalBg, type TerminalRendererRef } from "./helpers";
import {
	useFileLinkClick,
	useTerminalColdRestore,
	useTerminalConnection,
	useTerminalCwd,
	useTerminalHotkeys,
	useTerminalLifecycle,
	useTerminalModes,
	useTerminalRefs,
	useTerminalRestore,
	useTerminalStream,
} from "./hooks";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { TerminalSearch } from "./TerminalSearch";
import type {
	TerminalExitReason,
	TerminalProps,
	TerminalStreamEvent,
} from "./types";
import { shellEscapePaths } from "./utils";

const stripLeadingEmoji = (text: string) =>
	text.trim().replace(/^[\p{Emoji}\p{Symbol}]\s*/u, "");

export const Terminal = ({
	paneId,
	tabId,
	workspaceId,
	isVisible = true,
}: TerminalProps) => {
	const pane = useTabsStore((s) => s.panes[paneId]);
	const paneInitialCwd = pane?.initialCwd;
	const clearPaneInitialData = useTabsStore((s) => s.clearPaneInitialData);

	const { data: workspaceData } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ staleTime: 30_000 },
	);
	const isUnnamedRef = useRef(false);
	isUnnamedRef.current = workspaceData?.isUnnamed ?? false;

	const utils = electronTrpc.useUtils();
	const updateWorkspace = electronTrpc.workspaces.update.useMutation({
		onSuccess: () => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.workspaces.get.invalidate({ id: workspaceId });
		},
	});

	const renameUnnamedWorkspaceRef = useRef<(title: string) => void>(() => {});
	renameUnnamedWorkspaceRef.current = (title: string) => {
		const cleanedTitle = stripLeadingEmoji(title);
		if (isUnnamedRef.current && cleanedTitle) {
			updateWorkspace.mutate({
				id: workspaceId,
				patch: { name: cleanedTitle, preserveUnnamedStatus: true },
			});
		}
	};
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const rendererRef = useRef<TerminalRendererRef | null>(null);
	const isExitedRef = useRef(false);
	const [exitStatus, setExitStatus] = useState<"killed" | "exited" | null>(
		null,
	);
	const wasKilledByUserRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const commandBufferRef = useRef("");
	const tabIdRef = useRef(tabId);
	tabIdRef.current = tabId;
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setPaneName = useTabsStore((s) => s.setPaneName);
	const removePane = useTabsStore((s) => s.removePane);
	const focusedPaneId = useTabsStore((s) => s.focusedPaneIds[tabId]);
	const terminalTheme = useTerminalTheme();

	// Terminal connection state and mutations
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

	// Terminal CWD management
	const { updateCwdFromData } = useTerminalCwd({
		paneId,
		initialCwd: paneInitialCwd,
		workspaceCwd,
	});

	// Terminal modes tracking
	const {
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		updateModesFromData,
		resetModes,
	} = useTerminalModes();

	// File link click handler
	const { handleFileLinkClick } = useFileLinkClick({
		workspaceId,
		workspaceCwd,
	});

	// URL click handler - opens in app browser or system browser based on setting
	const { data: openLinksInApp } =
		electronTrpc.settings.getOpenLinksInApp.useQuery();
	const openInBrowserPane = useTabsStore((s) => s.openInBrowserPane);
	const handleUrlClickRef = useRef<((url: string) => void) | undefined>(
		undefined,
	);
	handleUrlClickRef.current = openLinksInApp
		? (url: string) => openInBrowserPane(workspaceId, url)
		: undefined;

	// Refs for stream event handlers (populated after useTerminalStream)
	// These allow flushPendingEvents to call the handlers via refs
	const handleTerminalExitRef = useRef<
		(exitCode: number, xterm: XTerm, reason?: TerminalExitReason) => void
	>(() => {});
	const handleStreamErrorRef = useRef<
		(
			event: Extract<TerminalStreamEvent, { type: "error" }>,
			xterm: XTerm,
		) => void
	>(() => {});

	const {
		isFocused,
		isFocusedRef,
		initialThemeRef,
		paneInitialCwdRef,
		clearPaneInitialDataRef,
		workspaceCwdRef,
		handleFileLinkClickRef,
		setPaneNameRef,
		handleTerminalFocusRef,
		registerClearCallbackRef,
		unregisterClearCallbackRef,
		registerScrollToBottomCallbackRef,
		unregisterScrollToBottomCallbackRef,
		registerGetSelectionCallbackRef,
		unregisterGetSelectionCallbackRef,
		registerPasteCallbackRef,
		unregisterPasteCallbackRef,
	} = useTerminalRefs({
		paneId,
		tabId,
		isVisible,
		focusedPaneId,
		terminalTheme,
		paneInitialCwd,
		clearPaneInitialData,
		workspaceCwd,
		handleFileLinkClick,
		setPaneName,
		setFocusedPane,
	});

	// Terminal restore logic
	const {
		isStreamReadyRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		maybeApplyInitialState,
		flushPendingEvents,
	} = useTerminalRestore({
		paneId,
		xtermRef,
		fitAddonRef,
		pendingEventsRef,
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		updateCwdFromData,
		updateModesFromData,
		onExitEvent: (exitCode, xterm, reason) =>
			handleTerminalExitRef.current(exitCode, xterm, reason),
		onErrorEvent: (event, xterm) => handleStreamErrorRef.current(event, xterm),
		onDisconnectEvent: (reason) =>
			setConnectionError(reason || "Connection to terminal daemon lost"),
	});

	// Cold restore handling
	const {
		isRestoredMode,
		setIsRestoredMode,
		setRestoredCwd,
		handleRetryConnection,
		handleStartShell,
	} = useTerminalColdRestore({
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
	});

	// Avoid effect re-runs: track overlay states via refs for input gating
	const isRestoredModeRef = useRef(isRestoredMode);
	isRestoredModeRef.current = isRestoredMode;
	const connectionErrorRef = useRef(connectionError);
	connectionErrorRef.current = connectionError;

	// Auto-retry connection with exponential backoff
	const retryCountRef = useRef(0);
	const MAX_RETRIES = 5;
	const [isRendererReady, setIsRendererReady] = useState(false);
	const [isInitialFontReady, setIsInitialFontReady] = useState(false);
	const [isDisplayReady, setIsDisplayReady] = useState(false);

	// Stream handling
	const { handleTerminalExit, handleStreamError, handleStreamData } =
		useTerminalStream({
			paneId,
			xtermRef,
			isStreamReadyRef,
			isExitedRef,
			wasKilledByUserRef,
			pendingEventsRef,
			setExitStatus,
			setConnectionError,
			updateModesFromData,
			updateCwdFromData,
			onShellExit: () => removePane(paneId),
		});

	// Populate handler refs for flushPendingEvents to use
	handleTerminalExitRef.current = handleTerminalExit;
	handleStreamErrorRef.current = handleStreamError;

	useEffect(() => {
		let isCancelled = false;

		ensureGhosttyRuntime()
			.then(() => {
				if (isCancelled) return;
				setIsRendererReady(true);
			})
			.catch((error) => {
				if (isCancelled) return;

				console.error("[Terminal] Failed to initialize Ghostty:", error);
				setConnectionError(
					error instanceof Error
						? error.message
						: "Failed to initialize terminal renderer",
				);
			});

		return () => {
			isCancelled = true;
		};
	}, [setConnectionError]);

	// Stream subscription
	electronTrpc.terminal.stream.useSubscription(paneId, {
		onData: (event) => {
			if (connectionErrorRef.current && event.type === "data") {
				setConnectionError(null);
				retryCountRef.current = 0;
			}
			handleStreamData(event);
		},
		onError: (error) => {
			console.error("[Terminal] Stream subscription error:", {
				paneId,
				error: error instanceof Error ? error.message : String(error),
			});
			setConnectionError(
				error instanceof Error ? error.message : "Connection to terminal lost",
			);
		},
		enabled: true,
	});

	// Auto-retry when connection error is set
	useEffect(() => {
		if (!connectionError) return;
		if (isExitedRef.current) return;
		if (retryCountRef.current >= MAX_RETRIES) return;

		if (retryCountRef.current === 0) {
			xtermRef.current?.writeln(
				"\r\n\x1b[90m[Connection lost. Reconnecting...]\x1b[0m",
			);
		}

		const delay = Math.min(1000 * 2 ** retryCountRef.current, 10_000);
		retryCountRef.current++;

		const timeout = setTimeout(handleRetryConnection, delay);
		return () => clearTimeout(timeout);
	}, [connectionError, handleRetryConnection]);

	const { isSearchOpen, setIsSearchOpen } = useTerminalHotkeys({
		isFocused,
		xtermRef,
		supportsSearch: false,
	});
	useEffect(() => {
		if (!isRestoredMode) return;
		handleStartShell();
	}, [isRestoredMode, handleStartShell]);

	const { data: fontSettings, isPending: isFontSettingsPending } =
		electronTrpc.settings.getFontSettings.useQuery(undefined, {
			staleTime: 30_000,
		});
	const terminalFontFamily = resolveTerminalFontFamily(
		fontSettings?.terminalFontFamily,
	);
	const terminalFontSize =
		fontSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
	const initialFontFamilyRef = useRef(terminalFontFamily);
	const initialFontSizeRef = useRef(terminalFontSize);
	initialFontFamilyRef.current = terminalFontFamily;
	initialFontSizeRef.current = terminalFontSize;
	const isTerminalBootReady =
		isRendererReady && isInitialFontReady && !isFontSettingsPending;

	useEffect(() => {
		if (isFontSettingsPending) return;
		if (isInitialFontReady) return;

		let isCancelled = false;
		void preloadTerminalFonts(terminalFontFamily, terminalFontSize).finally(
			() => {
				if (isCancelled) return;
				setIsInitialFontReady(true);
			},
		);

		return () => {
			isCancelled = true;
		};
	}, [
		isFontSettingsPending,
		isInitialFontReady,
		terminalFontFamily,
		terminalFontSize,
	]);

	const { xtermInstance, restartTerminal } = useTerminalLifecycle({
		paneId,
		tabIdRef,
		workspaceId,
		terminalRef,
		isRendererReady: isTerminalBootReady,
		xtermRef,
		fitAddonRef,
		rendererRef,
		isExitedRef,
		wasKilledByUserRef,
		commandBufferRef,
		isFocusedRef,
		isRestoredModeRef,
		connectionErrorRef,
		initialThemeRef,
		initialFontFamilyRef,
		initialFontSizeRef,
		workspaceCwdRef,
		handleFileLinkClickRef,
		handleUrlClickRef,
		paneInitialCwdRef,
		clearPaneInitialDataRef,
		setConnectionError,
		setExitStatus,
		setIsRestoredMode,
		setRestoredCwd,
		createOrAttachRef,
		writeRef,
		resizeRef,
		detachRef,
		clearScrollbackRef,
		isStreamReadyRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		maybeApplyInitialState,
		flushPendingEvents,
		resetModes,
		isAlternateScreenRef,
		isBracketedPasteRef,
		setPaneNameRef,
		renameUnnamedWorkspaceRef,
		handleTerminalFocusRef,
		registerClearCallbackRef,
		unregisterClearCallbackRef,
		registerScrollToBottomCallbackRef,
		unregisterScrollToBottomCallbackRef,
		registerGetSelectionCallbackRef,
		unregisterGetSelectionCallbackRef,
		registerPasteCallbackRef,
		unregisterPasteCallbackRef,
	});

	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;
		// ghostty-web doesn't support runtime theme changes via options.theme.
		// Apply theme directly to the canvas renderer and force a re-render.
		const renderer = (xterm as unknown as { renderer?: { setTheme: (t: typeof terminalTheme) => void } }).renderer;
		if (renderer?.setTheme) {
			renderer.setTheme(terminalTheme);
		}
	}, [terminalTheme]);

	useEffect(() => {
		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!xterm || !fitAddon) return;

		let isCancelled = false;

		const applyTerminalFont = async () => {
			await preloadTerminalFonts(terminalFontFamily, terminalFontSize);
			if (
				isCancelled ||
				xtermRef.current !== xterm ||
				fitAddonRef.current !== fitAddon
			) {
				return;
			}

			xterm.options.fontFamily = terminalFontFamily;
			xterm.options.fontSize = terminalFontSize;

			if (!isVisible) return;

			const proposed = fitAddon.proposeDimensions();
			if (!proposed || proposed.cols <= 0 || proposed.rows <= 0) return;

			resizeRef.current({
				paneId,
				cols: proposed.cols,
				rows: proposed.rows,
			});
			xterm.resize(proposed.cols, proposed.rows);
		};

		void applyTerminalFont();

		return () => {
			isCancelled = true;
		};
	}, [isVisible, paneId, resizeRef, terminalFontFamily, terminalFontSize]);

	useLayoutEffect(() => {
		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!isTerminalBootReady) {
			setIsDisplayReady(false);
			return;
		}
		if (!xterm || !fitAddon) return;

		if (!isVisible) {
			setIsDisplayReady(false);
			xterm.blur();
			return;
		}

		let isCancelled = false;
		const syncVisibleLayout = () => {
			if (
				isCancelled ||
				xtermRef.current !== xterm ||
				fitAddonRef.current !== fitAddon
			)
				return false;

			const proposed = fitAddon.proposeDimensions();
			if (!proposed || proposed.cols <= 0 || proposed.rows <= 0) {
				return false;
			}

			if (proposed.cols !== xterm.cols || proposed.rows !== xterm.rows) {
				resizeRef.current({
					paneId,
					cols: proposed.cols,
					rows: proposed.rows,
				});
				xterm.resize(proposed.cols, proposed.rows);
			}

			if (isFocusedRef.current) {
				xterm.focus();
			}
			setIsDisplayReady(true);
			return true;
		};

		setIsDisplayReady(false);

		if (syncVisibleLayout()) {
			return () => {
				isCancelled = true;
			};
		}

		let frame = requestAnimationFrame(function retryVisibleLayout() {
			if (syncVisibleLayout()) {
				frame = 0;
				return;
			}
			if (isCancelled) return;
			frame = requestAnimationFrame(retryVisibleLayout);
		});

		return () => {
			isCancelled = true;
			if (frame) {
				cancelAnimationFrame(frame);
			}
		};
	}, [isFocusedRef, isTerminalBootReady, isVisible, paneId, resizeRef, xtermInstance]);

	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		const files = Array.from(event.dataTransfer.files);
		let text: string;
		if (files.length > 0) {
			// Native file drop (from Finder, etc.)
			const paths = files.map((file) => window.webUtils.getPathForFile(file));
			text = shellEscapePaths(paths);
		} else {
			// Internal drag (from file tree) - path is in text/plain
			const plainText = event.dataTransfer.getData("text/plain");
			if (!plainText) return;
			text = shellEscapePaths([plainText]);
		}
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
				searchAddon={null}
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
			/>
			<ScrollToBottomButton terminal={xtermInstance} />
			{exitStatus === "killed" && !connectionError && !isRestoredMode && (
				<SessionKilledOverlay onRestart={restartTerminal} />
			)}
			<div
				ref={terminalRef}
				className="h-full w-full"
				style={{
					opacity: isDisplayReady ? 1 : 0,
					visibility: isDisplayReady ? "visible" : "hidden",
				}}
			/>
		</div>
	);
};
