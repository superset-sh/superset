import type { RendererContext } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import "@xterm/xterm/css/xterm.css";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useTerminalLinkActions } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { openUrlInV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openUrlInV2Workspace";
import { useWorkspaceWsUrl } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";
import { ScrollToBottomButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/ScrollToBottomButton";
import { TerminalSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/TerminalSearch";
import { useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";
import { LinkHoverTooltip } from "./components/LinkHoverTooltip";
import { useLinkClickHint } from "./hooks/useLinkClickHint";
import { useLinkHoverState } from "./hooks/useLinkHoverState";
import { useTerminalAppearance } from "./hooks/useTerminalAppearance";
import { shellEscapePaths } from "./utils";

interface TerminalPaneProps {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
}

export function TerminalPane({
	ctx,
	workspaceId,
	onOpenFile,
	onRevealPath,
}: TerminalPaneProps) {
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const { getFileAction, getUrlAction } = useTerminalLinkActions();
	const {
		hoveredLink,
		onHover: onLinkHover,
		onLeave: onLinkLeave,
	} = useLinkHoverState();
	const { hint, showHint } = useLinkClickHint();
	const paneData = ctx.pane.data as TerminalPaneData;
	const { terminalId } = paneData;
	const terminalInstanceId = ctx.pane.id;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const activeTheme = useTheme();
	const [isSearchOpen, setIsSearchOpen] = useState(false);

	const appearance = useTerminalAppearance();
	const appearanceRef = useRef(appearance);
	appearanceRef.current = appearance;
	const initialThemeTypeRef = useRef<
		ReturnType<typeof resolveTerminalThemeType>
	>(
		resolveTerminalThemeType({
			activeThemeType: activeTheme?.type,
		}),
	);

	// URL is stable — no workspaceId/themeType in query params.
	// Session is created via tRPC before WebSocket connects.
	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`);
	const websocketUrlRef = useRef(websocketUrl);
	websocketUrlRef.current = websocketUrl;
	const workspaceIdRef = useRef(workspaceId);
	workspaceIdRef.current = workspaceId;

	const ensureSession = workspaceTrpc.terminal.ensureSession.useMutation();
	const ensureSessionRef = useRef(ensureSession);
	ensureSessionRef.current = ensureSession;
	const workspaceTrpcUtils = workspaceTrpc.useUtils();
	const invalidateTerminalSessionsRef = useRef(
		workspaceTrpcUtils.terminal.listSessions.invalidate,
	);
	invalidateTerminalSessionsRef.current =
		workspaceTrpcUtils.terminal.listSessions.invalidate;

	// useCallback so useSyncExternalStore doesn't re-subscribe every render —
	// otherwise every keystroke-triggered re-render unsubscribes and
	// re-subscribes the registry listener. See React's useSyncExternalStore
	// docs ("If you don't memoize the subscribe function…").
	const subscribe = useCallback(
		(callback: () => void) =>
			terminalRuntimeRegistry.onStateChange(
				terminalId,
				callback,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const getSnapshot = useCallback(
		(): ConnectionState =>
			terminalRuntimeRegistry.getConnectionState(
				terminalId,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const connectionState = useSyncExternalStore(subscribe, getSnapshot);

	// DOM-first lifecycle (VSCode/Tabby pattern):
	//   1. mount() attaches xterm to the container synchronously — terminal
	//      is visible immediately, even on cold start. For a warm return
	//      (workspace switch) this reparents the wrapper from the parking
	//      container back into the live tree, preserving the buffer.
	//   2. ensureSession guarantees the server session exists, then connect()
	//      opens the WebSocket. Never before — otherwise the server replies
	//      "Session not found."
	// Deps narrowed to [terminalId] so provider key remount churn (workspaceId
	// briefly flipping while pane data catches up) doesn't re-run this effect.
	// workspaceId / websocketUrl are read through refs.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.mount(
			terminalId,
			container,
			appearanceRef.current,
			terminalInstanceId,
		);

		let cancelled = false;
		const sessionWorkspaceId = workspaceIdRef.current;

		// Always connect after ensureSession settles, even on error: if the
		// session actually exists on the server (e.g. we raced another client),
		// connect() succeeds; otherwise "Session not found" surfaces in-terminal
		// as an error line. connect() is idempotent, so a warm terminal whose
		// WS is already open against the same URL is a no-op.
		ensureSessionRef.current
			.mutateAsync({
				terminalId,
				workspaceId: sessionWorkspaceId,
				themeType: initialThemeTypeRef.current,
			})
			.then((result) => {
				if (result.status === "active") {
					void invalidateTerminalSessionsRef.current({
						workspaceId: sessionWorkspaceId,
					});
				}
			})
			.catch((err) => {
				console.error("[TerminalPane] ensureSession failed:", err);
			})
			.finally(() => {
				if (cancelled) return;
				terminalRuntimeRegistry.connect(
					terminalId,
					websocketUrlRef.current,
					terminalInstanceId,
				);
			});

		return () => {
			cancelled = true;
			terminalRuntimeRegistry.detach(terminalId, terminalInstanceId);
		};
	}, [terminalId, terminalInstanceId]);

	// WS URL can change while the terminal stays mounted (token refresh, host
	// URL re-resolution on provider remount). Reconnect only if the transport
	// is already live — on initial mount the transport is "disconnected" and
	// we let the ensureSession path above open it.
	useEffect(() => {
		terminalRuntimeRegistry.reconnect(
			terminalId,
			websocketUrl,
			terminalInstanceId,
		);
	}, [terminalId, terminalInstanceId, websocketUrl]);

	useEffect(() => {
		terminalRuntimeRegistry.updateAppearance(
			terminalId,
			appearance,
			terminalInstanceId,
		);
	}, [terminalId, terminalInstanceId, appearance]);

	// --- Link handlers ---
	// All filesystem operations go through the host service.
	// statPath is a mutation (POST) to avoid tRPC GET URL encoding issues
	// with paths containing special characters like ().
	const statPathMutation = workspaceTrpc.filesystem.statPath.useMutation();
	const statPathRef = useRef(statPathMutation.mutateAsync);
	statPathRef.current = statPathMutation.mutateAsync;

	useEffect(() => {
		terminalRuntimeRegistry.setLinkHandlers(
			terminalId,
			{
				stat: async (path) => {
					try {
						const result = await statPathRef.current({
							workspaceId,
							path,
						});
						if (!result) return null;
						return {
							isDirectory: result.isDirectory,
							resolvedPath: result.resolvedPath,
						};
					} catch {
						return null;
					}
				},
				onFileLinkClick: (event, link) => {
					// Folders are not settings-controlled: ⌘ reveals in sidebar,
					// ⌘⇧ falls through to the external editor path, plain = hint.
					if (link.isDirectory) {
						if (!event.metaKey && !event.ctrlKey) {
							showHint(event.clientX, event.clientY);
							return;
						}
						event.preventDefault();
						if (event.shiftKey) {
							openInExternalEditor(link.resolvedPath);
						} else {
							onRevealPath(link.resolvedPath, { isDirectory: true });
						}
						return;
					}

					const action = getFileAction(event);
					if (action === null) {
						showHint(event.clientX, event.clientY);
						return;
					}
					event.preventDefault();
					if (action === "external") {
						openInExternalEditor(link.resolvedPath, {
							line: link.row,
							column: link.col,
						});
					} else {
						onOpenFile(link.resolvedPath);
					}
				},
				onUrlClick: (event, url) => {
					const action = getUrlAction(event);
					if (action === null) {
						showHint(event.clientX, event.clientY);
						return;
					}
					event.preventDefault();
					if (action === "external") {
						electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
							console.error("[v2 Terminal] Failed to open URL:", url, error);
						});
					} else {
						openUrlInV2Workspace({
							store: ctx.store,
							target: "current-tab",
							url,
						});
					}
				},
				onLinkHover,
				onLinkLeave,
			},
			terminalInstanceId,
		);
	}, [
		terminalId,
		terminalInstanceId,
		workspaceId,
		ctx.store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		onLinkHover,
		onLinkLeave,
		showHint,
		getFileAction,
		getUrlAction,
	]);

	useHotkey(
		"CLEAR_TERMINAL",
		() => {
			terminalRuntimeRegistry.clear(terminalId, terminalInstanceId);
		},
		{ enabled: ctx.isActive },
	);

	useHotkey(
		"SCROLL_TO_BOTTOM",
		() => {
			terminalRuntimeRegistry.scrollToBottom(terminalId, terminalInstanceId);
		},
		{ enabled: ctx.isActive },
	);

	useHotkey("FIND_IN_TERMINAL", () => setIsSearchOpen((prev) => !prev), {
		enabled: ctx.isActive,
		preventDefault: true,
	});

	// connectionState in deps ensures terminal ref re-derives after connect/disconnect
	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState is intentionally included to trigger re-derive
	const terminal = useMemo(
		() => terminalRuntimeRegistry.getTerminal(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId, connectionState],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState is intentionally included to trigger re-derive
	const searchAddon = useMemo(
		() =>
			terminalRuntimeRegistry.getSearchAddon(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId, connectionState],
	);

	const [isDropActive, setIsDropActive] = useState(false);
	const dragCounterRef = useRef(0);

	const resolveDroppedText = (dataTransfer: DataTransfer): string | null => {
		const files = Array.from(dataTransfer.files);
		if (files.length > 0) {
			const paths = files
				.map((file) => window.webUtils.getPathForFile(file))
				.filter(Boolean);
			return paths.length > 0 ? shellEscapePaths(paths) : null;
		}
		const plainText = dataTransfer.getData("text/plain");
		return plainText ? shellEscapePaths([plainText]) : null;
	};

	const handleDragEnter = (event: React.DragEvent) => {
		event.preventDefault();
		dragCounterRef.current += 1;
		setIsDropActive(true);
	};

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDragLeave = (event: React.DragEvent) => {
		event.preventDefault();
		dragCounterRef.current -= 1;
		if (dragCounterRef.current <= 0) {
			dragCounterRef.current = 0;
			setIsDropActive(false);
		}
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		dragCounterRef.current = 0;
		setIsDropActive(false);
		if (connectionState === "closed") return;
		const text = resolveDroppedText(event.dataTransfer);
		if (!text) return;
		terminalRuntimeRegistry
			.getTerminal(terminalId, terminalInstanceId)
			?.focus();
		terminalRuntimeRegistry.paste(terminalId, text, terminalInstanceId);
	};

	return (
		<div
			role="application"
			className="flex h-full w-full flex-col p-2"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<TerminalSearch
					searchAddon={searchAddon}
					isOpen={isSearchOpen}
					onClose={() => setIsSearchOpen(false)}
				/>
				<div
					ref={containerRef}
					className="h-full w-full"
					style={{ backgroundColor: appearance.background }}
				/>
				<ScrollToBottomButton terminal={terminal} />
				{isDropActive && (
					<div className="pointer-events-none absolute inset-0 rounded-sm border-2 border-primary/60 border-dashed bg-primary/10" />
				)}
			</div>
			{connectionState === "closed" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>Disconnected</span>
				</div>
			)}
			<LinkHoverTooltip hoveredLink={hoveredLink} hint={hint} />
		</div>
	);
}
