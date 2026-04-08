import type { RendererContext } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useWorkspaceWsUrl } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";
import { ScrollToBottomButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/ScrollToBottomButton";
import { useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";
import { useTerminalAppearance } from "./hooks/useTerminalAppearance";

interface TerminalPaneProps {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}

function subscribeToState(terminalId: string) {
	return (callback: () => void) =>
		terminalRuntimeRegistry.onStateChange(terminalId, callback);
}

function getConnectionState(terminalId: string): ConnectionState {
	return terminalRuntimeRegistry.getConnectionState(terminalId);
}

export function TerminalPane({ ctx, workspaceId }: TerminalPaneProps) {
	const { terminalId } = ctx.pane.data as TerminalPaneData;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const activeTheme = useTheme();

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

	useHotkey("CLEAR_TERMINAL", () => {
		terminalRuntimeRegistry.clear(terminalId);
	});

	useHotkey("SCROLL_TO_BOTTOM", () => {
		terminalRuntimeRegistry.scrollToBottom(terminalId);
	});

	// connectionState in deps ensures terminal ref re-derives after connect/disconnect
	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState is intentionally included to trigger re-derive
	const terminal = useMemo(
		() => terminalRuntimeRegistry.getTerminal(terminalId),
		[terminalId, connectionState],
	);

	return (
		<div className="flex h-full w-full flex-col p-2">
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<div
					ref={containerRef}
					className="h-full w-full"
					style={{ backgroundColor: appearance.background }}
				/>
				<ScrollToBottomButton terminal={terminal} />
			</div>
			{connectionState === "closed" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>Disconnected</span>
				</div>
			)}
		</div>
	);
}
