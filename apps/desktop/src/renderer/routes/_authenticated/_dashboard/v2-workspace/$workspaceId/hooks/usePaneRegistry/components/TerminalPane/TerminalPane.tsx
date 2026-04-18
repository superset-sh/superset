import type { RendererContext } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import "@xterm/xterm/css/xterm.css";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import type {
	BrowserPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
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
	onRevealPath: (path: string) => void;
}

function subscribeToState(terminalId: string) {
	return (callback: () => void) =>
		terminalRuntimeRegistry.onStateChange(terminalId, callback);
}

function getConnectionState(terminalId: string): ConnectionState {
	return terminalRuntimeRegistry.getConnectionState(terminalId);
}

export function TerminalPane({
	ctx,
	workspaceId,
	onOpenFile,
	onRevealPath,
}: TerminalPaneProps) {
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const {
		hoveredLink,
		onHover: onLinkHover,
		onLeave: onLinkLeave,
	} = useLinkHoverState();
	const { hint, showHint } = useLinkClickHint();
	const paneData = ctx.pane.data as TerminalPaneData;
	const { terminalId } = paneData;
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
	const initialThemeType = initialThemeTypeRef.current;

	// URL is stable — no workspaceId/themeType in query params.
	// Session is created via tRPC before WebSocket connects.
	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`);

	const ensureSession = workspaceTrpc.terminal.ensureSession.useMutation();
	const ensureSessionRef = useRef(ensureSession);
	ensureSessionRef.current = ensureSession;

	const connectionState = useSyncExternalStore(
		subscribeToState(terminalId),
		() => getConnectionState(terminalId),
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let cancelled = false;

		// Create session via tRPC, then connect WebSocket as data pipe.
		ensureSessionRef.current
			.mutateAsync({
				terminalId,
				workspaceId,
				themeType: initialThemeType,
			})
			.then(() => {
				if (cancelled) return;
				terminalRuntimeRegistry.attach(
					terminalId,
					container,
					websocketUrl,
					appearanceRef.current,
				);
			})
			.catch((err) => {
				if (cancelled) return;
				console.error("[TerminalPane] ensureSession failed:", err);
				// Still try to connect — WS handler has fallback for existing sessions
				terminalRuntimeRegistry.attach(
					terminalId,
					container,
					websocketUrl,
					appearanceRef.current,
				);
			});

		return () => {
			cancelled = true;
			terminalRuntimeRegistry.detach(terminalId);
		};
	}, [terminalId, websocketUrl, initialThemeType, workspaceId]);

	useEffect(() => {
		terminalRuntimeRegistry.updateAppearance(terminalId, appearance);
	}, [terminalId, appearance]);

	// --- Link handlers ---
	// All filesystem operations go through the host service.
	// statPath is a mutation (POST) to avoid tRPC GET URL encoding issues
	// with paths containing special characters like ().
	const statPathMutation = workspaceTrpc.filesystem.statPath.useMutation();
	const statPathRef = useRef(statPathMutation.mutateAsync);
	statPathRef.current = statPathMutation.mutateAsync;

	useEffect(() => {
		terminalRuntimeRegistry.setLinkHandlers(terminalId, {
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
				if (!event.metaKey && !event.ctrlKey) {
					showHint(event.clientX, event.clientY);
					return;
				}
				event.preventDefault();
				if (event.shiftKey) {
					openInExternalEditor(link.resolvedPath, {
						line: link.row,
						column: link.col,
					});
					return;
				}
				if (link.isDirectory) {
					onRevealPath(link.resolvedPath);
				} else {
					onOpenFile(link.resolvedPath);
				}
			},
			onUrlClick: (event, url) => {
				if (event.shiftKey) {
					electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
						console.error("[v2 Terminal] Failed to open URL:", url, error);
					});
					return;
				}
				ctx.store.getState().openPane({
					pane: {
						kind: "browser",
						data: { url } satisfies BrowserPaneData,
					},
				});
			},
			onLinkHover,
			onLinkLeave,
		});
	}, [
		terminalId,
		workspaceId,
		ctx.store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		onLinkHover,
		onLinkLeave,
		showHint,
	]);

	useHotkey(
		"CLEAR_TERMINAL",
		() => {
			terminalRuntimeRegistry.clear(terminalId);
		},
		{ enabled: ctx.isActive },
	);

	useHotkey(
		"SCROLL_TO_BOTTOM",
		() => {
			terminalRuntimeRegistry.scrollToBottom(terminalId);
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
		() => terminalRuntimeRegistry.getTerminal(terminalId),
		[terminalId, connectionState],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState is intentionally included to trigger re-derive
	const searchAddon = useMemo(
		() => terminalRuntimeRegistry.getSearchAddon(terminalId),
		[terminalId, connectionState],
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
		terminalRuntimeRegistry.getTerminal(terminalId)?.focus();
		terminalRuntimeRegistry.paste(terminalId, text);
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
