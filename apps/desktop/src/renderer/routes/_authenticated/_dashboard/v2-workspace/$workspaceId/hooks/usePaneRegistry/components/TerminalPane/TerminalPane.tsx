import type { RendererContext } from "@superset/panes";
import { cn } from "@superset/ui/utils";
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
import { useHotkey } from "renderer/hotkeys";
import {
	actionLabel,
	folderIntentFor,
	folderIntentLabel,
	LinkHoverHint,
	useTerminalFilePolicy,
	useTerminalUrlPolicy,
} from "renderer/lib/clickPolicy";
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
import { useLinkClickHint } from "./hooks/useLinkClickHint";
import { type HoveredLink, useLinkHoverState } from "./hooks/useLinkHoverState";
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
	const filePolicy = useTerminalFilePolicy();
	const urlPolicy = useTerminalUrlPolicy();
	const {
		hoveredLink,
		onHover: onLinkHover,
		onLeave: onLinkLeave,
	} = useLinkHoverState();
	const { hint, showHint } = useLinkClickHint();
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const paneData = ctx.pane.data as TerminalPaneData;
	const { terminalId } = paneData;
	const initialCommandRef = useRef(paneData.initialCommand);
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

	// Include workspaceId/themeType so the WebSocket route can create the
	// session on open. Terminal attach should not wait behind workspace tRPC.
	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`, {
		workspaceId,
		themeType: initialThemeTypeRef.current,
	});
	const websocketUrlRef = useRef(websocketUrl);
	websocketUrlRef.current = websocketUrl;
	const workspaceIdRef = useRef(workspaceId);
	workspaceIdRef.current = workspaceId;

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
	//   2. connect() opens the WebSocket immediately. The host-service terminal
	//      route creates the session from the URL workspaceId if needed, avoiding
	//      tRPC head-of-line blocking during workspace switches.
	// Deps narrowed to the terminal identity so provider key remount churn
	// (workspaceId briefly flipping while pane data catches up) doesn't re-run
	// this effect. workspaceId / websocketUrl are read through refs.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.mount(
			terminalId,
			container,
			appearanceRef.current,
			terminalInstanceId,
		);

		terminalRuntimeRegistry.connect(
			terminalId,
			websocketUrlRef.current,
			terminalInstanceId,
			{ initialCommand: initialCommandRef.current },
		);

		return () => {
			terminalRuntimeRegistry.detach(terminalId, terminalInstanceId);
		};
	}, [terminalId, terminalInstanceId]);

	useEffect(() => {
		if (connectionState !== "open" || !initialCommandRef.current) return;

		initialCommandRef.current = undefined;
		if (paneData.initialCommand === undefined) return;

		ctx.actions.updateData({
			...paneData,
			initialCommand: undefined,
		} as PaneViewerData);
	}, [connectionState, ctx.actions, paneData]);

	const lastInvalidatedOpenSessionRef = useRef<string | null>(null);
	useEffect(() => {
		const invalidateSessionsAfterSocketOpen = () => {
			if (
				terminalRuntimeRegistry.getConnectionState(
					terminalId,
					terminalInstanceId,
				) !== "open"
			) {
				lastInvalidatedOpenSessionRef.current = null;
				return;
			}

			const sessionWorkspaceId = workspaceIdRef.current;
			const invalidateKey = `${sessionWorkspaceId}:${terminalId}:${terminalInstanceId}:${websocketUrlRef.current}`;
			if (lastInvalidatedOpenSessionRef.current === invalidateKey) return;
			lastInvalidatedOpenSessionRef.current = invalidateKey;

			void invalidateTerminalSessionsRef.current({
				workspaceId: sessionWorkspaceId,
			});
		};

		invalidateSessionsAfterSocketOpen();
		return terminalRuntimeRegistry.onStateChange(
			terminalId,
			invalidateSessionsAfterSocketOpen,
			terminalInstanceId,
		);
	}, [terminalId, terminalInstanceId]);

	// WS URL can change while the terminal stays mounted (token refresh, host
	// URL re-resolution on provider remount). Reconnect only if the transport
	// is already live — on initial mount the transport is "disconnected" and
	// we let the mount path above open it.
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
					if (link.isDirectory) {
						const intent = folderIntentFor(event);
						if (intent === null) {
							showHint(event.clientX, event.clientY);
							return;
						}
						event.preventDefault();
						if (intent === "external") {
							openInExternalEditor(link.resolvedPath);
						} else {
							onRevealPath(link.resolvedPath, { isDirectory: true });
						}
						return;
					}

					const action = filePolicy.getAction(event);
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
					} else if (action === "newTab") {
						onOpenFile(link.resolvedPath, true);
					} else {
						onOpenFile(link.resolvedPath);
					}
				},
				onUrlClick: (event, url) => {
					const action = urlPolicy.getAction(event);
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
							target: action === "newTab" ? "new-tab" : "current-tab",
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
		filePolicy,
		urlPolicy,
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
			className="relative flex h-full w-full flex-col p-2"
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
			</div>
			<div
				className={cn(
					"pointer-events-none absolute inset-0 bg-primary/10 transition-opacity duration-100",
					isDropActive ? "opacity-75" : "opacity-0",
				)}
			/>
			{connectionState === "closed" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>Disconnected</span>
				</div>
			)}
			<LinkHoverHint
				hoverLabel={resolveHoverLabel(hoveredLink, filePolicy, urlPolicy)}
				hoverPosition={hoveredLink}
				clickHint={hint}
			/>
		</div>
	);
}

// Compute "what would clicking right now do?" for the live link tooltip.
// Folders use the hardcoded folderIntent rule; files/urls go through the
// settings-driven policies. Returns null when no modifier is held or the
// matching tier is unbound — the tooltip stays hidden in that case.
function resolveHoverLabel(
	hovered: HoveredLink | null,
	filePolicy: ReturnType<typeof useTerminalFilePolicy>,
	urlPolicy: ReturnType<typeof useTerminalUrlPolicy>,
): string | null {
	if (!hovered) return null;
	const event = {
		metaKey: hovered.modifier,
		ctrlKey: false,
		shiftKey: hovered.shift,
	};
	if (hovered.info.kind === "url") {
		const action = urlPolicy.getAction(event);
		return action ? actionLabel(action, "url") : null;
	}
	if (hovered.info.isDirectory) {
		return folderIntentLabel(folderIntentFor(event));
	}
	const action = filePolicy.getAction(event);
	return action ? actionLabel(action, "file") : null;
}
