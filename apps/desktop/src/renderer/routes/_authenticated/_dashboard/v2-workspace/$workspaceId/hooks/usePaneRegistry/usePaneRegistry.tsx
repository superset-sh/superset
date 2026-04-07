import type {
	ContextMenuActionConfig,
	PaneRegistry,
	RendererContext,
} from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import { Circle, Globe, MessageSquare, TerminalSquare } from "lucide-react";
import { useMemo } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import type {
	BrowserPaneData,
	ChatPaneData,
	DevtoolsPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { ChatPane } from "./components/ChatPane";
import { FilePane } from "./components/FilePane";
import { TerminalPane } from "./components/TerminalPane";

function getFileName(filePath: string): string {
	return filePath.split("/").pop() ?? filePath;
}

const MOD_KEY = navigator.platform.toLowerCase().includes("mac")
	? "⌘"
	: "Ctrl+";

export function usePaneRegistry(
	workspaceId: string,
): PaneRegistry<PaneViewerData> {
	const clearShortcut = useHotkeyDisplay("CLEAR_TERMINAL").text;
	const scrollToBottomShortcut = useHotkeyDisplay("SCROLL_TO_BOTTOM").text;

	return useMemo<PaneRegistry<PaneViewerData>>(
		() => ({
			file: {
				getIcon: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					const name = getFileName(data.filePath);
					return <FileIcon fileName={name} className="size-4" />;
				},
				getTitle: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					const name = getFileName(data.filePath);
					return (
						<div className="flex items-center space-x-2">
							<span className={ctx.pane.pinned ? undefined : "italic"}>
								{name}
							</span>
							{data.hasChanges && (
								<Circle className="size-2 shrink-0 fill-current text-muted-foreground" />
							)}
						</div>
					);
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<FilePane context={ctx} workspaceId={workspaceId} />
				),
				onHeaderClick: (ctx: RendererContext<PaneViewerData>) =>
					ctx.actions.pin(),
				onBeforeClose: (pane) => {
					const data = pane.data as FilePaneData;
					if (!data.hasChanges) return true;
					const name = data.filePath.split("/").pop();
					return new Promise<boolean>((resolve) => {
						alert({
							title: `Do you want to save the changes you made to ${name}?`,
							description: "Your changes will be lost if you don't save them.",
							actions: [
								{
									label: "Save",
									onClick: () => {
										// TODO: wire up save via editor ref
										resolve(true);
									},
								},
								{
									label: "Don't Save",
									variant: "secondary",
									onClick: () => resolve(true),
								},
								{
									label: "Cancel",
									variant: "ghost",
									onClick: () => resolve(false),
								},
							],
						});
					});
				},
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close File" } : d,
					),
			},
			terminal: {
				getIcon: () => <TerminalSquare className="size-4" />,
				getTitle: () => "Terminal",
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<TerminalPane ctx={ctx} workspaceId={workspaceId} />
				),
				contextMenuActions: (_ctx, defaults) => {
					const terminalActions: ContextMenuActionConfig<PaneViewerData>[] = [
						{
							key: "copy",
							label: "Copy",
							icon: <LuClipboardCopy />,
							shortcut: `${MOD_KEY}C`,
							disabled: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								return !terminalRuntimeRegistry.getSelection(terminalId);
							},
							onSelect: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								const text = terminalRuntimeRegistry.getSelection(terminalId);
								if (text) navigator.clipboard.writeText(text);
							},
						},
						{
							key: "paste",
							label: "Paste",
							icon: <LuClipboard />,
							shortcut: `${MOD_KEY}V`,
							onSelect: async (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								try {
									const text = await navigator.clipboard.readText();
									if (text) terminalRuntimeRegistry.paste(terminalId, text);
								} catch {
									// Clipboard access denied
								}
							},
						},
						{ key: "sep-terminal-clipboard", type: "separator" },
						{
							key: "clear-terminal",
							label: "Clear Terminal",
							icon: <LuEraser />,
							shortcut:
								clearShortcut !== "Unassigned" ? clearShortcut : undefined,
							onSelect: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								terminalRuntimeRegistry.clear(terminalId);
							},
						},
						{
							key: "scroll-to-bottom",
							label: "Scroll to Bottom",
							icon: <LuArrowDownToLine />,
							shortcut:
								scrollToBottomShortcut !== "Unassigned"
									? scrollToBottomShortcut
									: undefined,
							onSelect: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								terminalRuntimeRegistry.scrollToBottom(terminalId);
							},
						},
						{ key: "sep-terminal-defaults", type: "separator" },
					];

					// Update close label
					const modifiedDefaults = defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Terminal" } : d,
					);

					return [...terminalActions, ...modifiedDefaults];
				},
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
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Browser" } : d,
					),
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
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Chat" } : d,
					),
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
		[workspaceId, clearShortcut, scrollToBottomShortcut],
	);
}
