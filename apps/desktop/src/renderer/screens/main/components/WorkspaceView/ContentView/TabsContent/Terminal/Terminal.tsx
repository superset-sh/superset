import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "ghostty-web";
import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalTheme } from "renderer/stores/theme";
import { SessionKilledOverlay } from "./components";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE,
	TERMINAL_PADDING_PX,
} from "./config";
import {
	formatCssFontFamilyList,
	resolveTerminalFontFamily,
	TERMINAL_ICON_FALLBACK_FAMILY,
} from "./font-family";
import { ensureGhosttyReady, isGhosttyReady } from "./ghostty-runtime";
import { getDefaultTerminalBg } from "./helpers";
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
import type { TerminalSearchAdapter } from "./TerminalSearch/terminal-search-adapter";
import type {
	TerminalExitReason,
	TerminalProps,
	TerminalStreamEvent,
} from "./types";
import { shellEscapePaths } from "./utils";

const stripLeadingEmoji = (text: string) =>
	text.trim().replace(/^[\p{Emoji}\p{Symbol}]\s*/u, "");

const TERMINAL_FONT_LOAD_TEST_STRING = "abcdefghijklmnopqrstuvwxyz0123456789";
const TERMINAL_ICON_LOAD_TEST_STRING = String.fromCodePoint(0xf024b);

type GhosttyRuntimeRenderer = {
	remeasureFont?: () => void;
	resize?: (cols: number, rows: number) => void;
	setTheme?: (theme: NonNullable<XTerm["options"]["theme"]>) => void;
	setFontFamily?: (family: string) => void;
	setFontSize?: (size: number) => void;
};

const getRuntimeRenderer = (xterm: XTerm): GhosttyRuntimeRenderer | undefined =>
	(xterm as unknown as { renderer?: GhosttyRuntimeRenderer }).renderer;

async function preloadTerminalFonts(
	family: string,
	size: number,
): Promise<void> {
	if (typeof document === "undefined") return;
	const fontFaceSet = document.fonts;
	if (!fontFaceSet || typeof fontFaceSet.load !== "function") return;

	try {
		await Promise.all([
			fontFaceSet.load(`${size}px ${family}`, TERMINAL_FONT_LOAD_TEST_STRING),
			fontFaceSet.load(
				`${size}px ${formatCssFontFamilyList(TERMINAL_ICON_FALLBACK_FAMILY)}`,
				TERMINAL_ICON_LOAD_TEST_STRING,
			),
		]);
	} catch (error) {
		console.warn("[Terminal] Failed to preload terminal fonts:", error);
	}
}

export const Terminal = ({ paneId, tabId, workspaceId }: TerminalProps) => {
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
	const searchAddonRef = useRef<TerminalSearchAdapter | null>(null);
	const [isRendererReady, setIsRendererReady] = useState(isGhosttyReady);
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

	useEffect(() => {
		let cancelled = false;
		ensureGhosttyReady()
			.then(() => {
				if (!cancelled) {
					setIsRendererReady(true);
				}
			})
			.catch((error) => {
				console.error("[Terminal] Failed to initialize ghostty-web:", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Terminal connection state and mutations
	const {
		connectionError,
		setConnectionError,
		workspaceCwd,
		refs: {
			createOrAttach: createOrAttachRef,
			write: writeRef,
			resizeAsync: resizeAsyncRef,
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
		pendingInitialStateRef,
		maybeApplyInitialState,
		flushPendingEvents,
	} = useTerminalRestore({
		paneId,
		xtermRef,
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
	});

	// Avoid effect re-runs: track overlay states via refs for input gating
	const isRestoredModeRef = useRef(isRestoredMode);
	isRestoredModeRef.current = isRestoredMode;
	const connectionErrorRef = useRef(connectionError);
	connectionErrorRef.current = connectionError;

	// Auto-retry connection with exponential backoff
	const retryCountRef = useRef(0);
	const MAX_RETRIES = 5;

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
	});
	useEffect(() => {
		if (!isRestoredMode) return;
		handleStartShell();
	}, [isRestoredMode, handleStartShell]);
	const { xtermInstance, restartTerminal } = useTerminalLifecycle({
		isRendererReady,
		paneId,
		tabIdRef,
		workspaceId,
		terminalRef,
		xtermRef,
		fitAddonRef,
		searchAddonRef,
		isExitedRef,
		wasKilledByUserRef,
		commandBufferRef,
		isFocusedRef,
		isRestoredModeRef,
		connectionErrorRef,
		initialThemeRef,
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
		resizeAsyncRef,
		detachRef,
		clearScrollbackRef,
		isStreamReadyRef,
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
		const runtimeRenderer = getRuntimeRenderer(xterm);
		if (runtimeRenderer?.setTheme) {
			runtimeRenderer.setTheme(terminalTheme);
			return;
		}
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);

	useEffect(() => {
		const xterm = xtermInstance ?? xtermRef.current;
		if (!xterm) return;
		let cancelled = false;
		const family =
			fontSettings?.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY;
		const size = fontSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;

		const applyFont = async () => {
			const resolvedFamily = resolveTerminalFontFamily(family, size);
			await preloadTerminalFonts(resolvedFamily, size);
			if (cancelled || xtermRef.current !== xterm) return;

			const runtimeRenderer = getRuntimeRenderer(xterm);
			if (runtimeRenderer?.setFontFamily && runtimeRenderer?.setFontSize) {
				runtimeRenderer.setFontFamily(resolvedFamily);
				runtimeRenderer.setFontSize(size);
			} else {
				xterm.options.fontFamily = resolvedFamily;
				xterm.options.fontSize = size;
			}

			if (typeof document !== "undefined" && "fonts" in document) {
				await (document as Document & { fonts: FontFaceSet }).fonts.ready;
				if (cancelled || xtermRef.current !== xterm) return;
			}

			// ghostty-web measures font metrics asynchronously after updates.
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
			if (cancelled || xtermRef.current !== xterm) return;

			runtimeRenderer?.remeasureFont?.();
			runtimeRenderer?.resize?.(xterm.cols, xterm.rows);

			const proposed = fitAddonRef.current?.proposeDimensions();
			if (!proposed) return;

			try {
				await resizeAsyncRef.current({
					paneId,
					cols: proposed.cols,
					rows: proposed.rows,
				});
				if (cancelled || xtermRef.current !== xterm) return;
				xterm.resize(proposed.cols, proposed.rows);
			} catch (error) {
				console.warn("[Terminal] Failed to resize after font update:", error);
			}
		};

		void applyFont();

		return () => {
			cancelled = true;
		};
	}, [
		xtermInstance,
		fontSettings?.terminalFontFamily,
		fontSettings?.terminalFontSize,
		paneId,
		resizeAsyncRef,
	]);

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
				searchAddon={searchAddonRef.current}
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
					caretColor: "transparent",
					padding: TERMINAL_PADDING_PX,
				}}
			/>
		</div>
	);
};
