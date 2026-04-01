import type { PaneRegistry, RendererContext } from "@superset/panes";
import { FileCode2, Globe, MessageSquare, TerminalSquare } from "lucide-react";
import { useMemo } from "react";
import type {
	BrowserPaneData,
	ChatPaneData,
	DevtoolsPaneData,
	FilePaneData,
	PaneViewerData,
} from "../../types";
import { ChatPane } from "./components/ChatPane";
import { WorkspaceFilePreview } from "./components/FilesPane/components/WorkspaceFilePreview/WorkspaceFilePreview";
import { TerminalPane } from "./components/TerminalPane";

function getFileTitle(filePath: string): string {
	return filePath.split("/").pop() ?? filePath;
}

export function usePaneRegistry(
	workspaceId: string,
): PaneRegistry<PaneViewerData> {
	return useMemo<PaneRegistry<PaneViewerData>>(
		() => ({
			file: {
				getIcon: () => <FileCode2 className="size-4" />,
				getTitle: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					return getFileTitle(data.filePath);
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					return (
						<WorkspaceFilePreview
							selectedFilePath={data.filePath}
							workspaceId={workspaceId}
						/>
					);
				},
			},
			terminal: {
				getIcon: () => <TerminalSquare className="size-4" />,
				getTitle: () => "Terminal",
				renderPane: () => <TerminalPane workspaceId={workspaceId} />,
			},
			browser: {
				getIcon: () => <Globe className="size-4" />,
				getTitle: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as BrowserPaneData;
					return data.url;
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as BrowserPaneData;
					return (
						<iframe
							className="h-full w-full border-0 bg-background"
							src={data.url}
							title={ctx.pane.titleOverride ?? "Browser"}
						/>
					);
				},
			},
			chat: {
				getIcon: () => <MessageSquare className="size-4" />,
				getTitle: () => "Chat",
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as ChatPaneData;
					return (
						<ChatPane
							onSessionIdChange={(sessionId) =>
								ctx.actions.updateData({
									sessionId,
								} as PaneViewerData)
							}
							sessionId={data.sessionId}
							workspaceId={workspaceId}
						/>
					);
				},
			},
			devtools: {
				getTitle: () => "DevTools",
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as DevtoolsPaneData;
					return (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Inspecting {data.targetTitle}
						</div>
					);
				},
			},
		}),
		[workspaceId],
	);
}
