import type {
	ContextMenuActionConfig,
	PaneRegistry,
	RendererContext,
} from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	Circle,
	GitCompareArrows,
	Globe,
	MessageSquare,
	SquareSplitHorizontal,
	TerminalSquare,
} from "lucide-react";
import { useMemo } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
} from "react-icons/lu";
import { TbScan } from "react-icons/tb";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import { useSettings } from "renderer/stores/settings";
import type {
	BrowserPaneData,
	ChatPaneData,
	DevtoolsPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import {
	BrowserPane,
	BrowserPaneToolbar,
	browserRuntimeRegistry,
} from "./components/BrowserPane";
import { ChatPane } from "./components/ChatPane";
import { DiffPane } from "./components/DiffPane";
import { FilePane } from "./components/FilePane";
import { TerminalPane } from "./components/TerminalPane";

function getFileName(filePath: string): string {
	return filePath.split("/").pop() ?? filePath;
}

const MOD_KEY = navigator.platform.toLowerCase().includes("mac")
	? "⌘"
	: "Ctrl+";

function DiffViewModeToggle() {
	const diffStyle = useSettings((s) => s.diffStyle);
	const updateSetting = useSettings((s) => s.update);

	const buttonClass = (active: boolean) =>
		cn(
			"flex size-6 items-center justify-center transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div className="flex items-center">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "unified")}
						aria-label="Unified view"
						aria-pressed={diffStyle === "unified"}
						className={buttonClass(diffStyle === "unified")}
					>
						<TbScan className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Unified view
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "split")}
						aria-label="Split view"
						aria-pressed={diffStyle === "split"}
						className={buttonClass(diffStyle === "split")}
					>
						<SquareSplitHorizontal className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Split view
				</TooltipContent>
			</Tooltip>
			<div
				className="mx-1.5 h-4 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
		</div>
	);
}

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
			diff: {
				getIcon: () => <GitCompareArrows className="size-4" />,
				getTitle: () => "Changes",
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<DiffPane context={ctx} workspaceId={workspaceId} />
				),
				renderHeaderExtras: () => <DiffViewModeToggle />,
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Diff" } : d,
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
					return data.pageTitle || data.url;
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPane ctx={ctx} />
				),
				renderToolbar: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPaneToolbar ctx={ctx} />
				),
				onRemoved: (pane) => browserRuntimeRegistry.destroy(pane.id),
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
