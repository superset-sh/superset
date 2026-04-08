import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { electronTrpcClient } from "renderer/lib/trpc-client";
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

	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`, {
		workspaceId,
		themeType: initialThemeType,
	});

	const connectionState = useSyncExternalStore(
		subscribeToState(terminalId),
		() => getConnectionState(terminalId),
	);

	// Appearance read from ref to avoid re-attach on theme/font change.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.attach(
			terminalId,
			container,
			websocketUrl,
			appearanceRef.current,
		);

		return () => {
			terminalRuntimeRegistry.detach(terminalId);
		};
	}, [terminalId, websocketUrl]);

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
			onFileLinkClick: (_event, link) => {
				if (!_event.metaKey && !_event.ctrlKey) return;
				_event.preventDefault();
				electronTrpcClient.external.openFileInEditor
					.mutate({
						path: link.resolvedPath,
						line: link.row,
						column: link.col,
					})
					.catch((error) => {
						console.error("[v2 Terminal] Failed to open file:", error);
						toast.error("Failed to open file in editor");
					});
			},
			onUrlClick: (url) => {
				electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
					console.error("[v2 Terminal] Failed to open URL:", url, error);
				});
			},
		});
	}, [terminalId, workspaceId]);

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
