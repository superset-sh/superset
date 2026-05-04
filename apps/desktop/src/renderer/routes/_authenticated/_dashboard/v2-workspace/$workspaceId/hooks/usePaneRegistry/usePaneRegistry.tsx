import type {
	ContextMenuActionConfig,
	PaneRegistry,
	RendererContext,
} from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	Circle,
	GitCompareArrows,
	Globe,
	MessageSquare,
	TerminalSquare,
} from "lucide-react";
import { useMemo } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
	LuPower,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { getBaseName } from "renderer/lib/pathBasename";
import { consumeTerminalBackgroundIntent } from "renderer/lib/terminal/terminal-background-intents";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import { getV2NotificationSourcesForPane } from "renderer/stores/v2-notifications";
import { V2NotificationStatusIndicator } from "../../components/V2NotificationStatusIndicator";
import {
	getDocument,
	useSharedFileDocument,
} from "../../state/fileDocumentStore";
import type {
	BrowserPaneData,
	ChatPaneData,
	CommentPaneData,
	DevtoolsPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { BrowserPane, BrowserPaneToolbar } from "./components/BrowserPane";
import { ChatPane } from "./components/ChatPane";
import { ChatPaneTitle } from "./components/ChatPane/components/ChatPaneTitle";
import { CommentPane } from "./components/CommentPane";
import { CommentPaneHeaderExtras } from "./components/CommentPane/components/CommentPaneHeaderExtras";
import { CommentPaneTitle } from "./components/CommentPane/components/CommentPaneTitle";
import { DiffPane } from "./components/DiffPane";
import { DiffPaneHeaderExtras } from "./components/DiffPane/components/DiffPaneHeaderExtras";
import { FilePane } from "./components/FilePane";
import { FilePaneHeaderExtras } from "./components/FilePane/components/FilePaneHeaderExtras";
import { TerminalPane } from "./components/TerminalPane";
import { TerminalHeaderExtras } from "./components/TerminalPane/components/TerminalHeaderExtras";
import { TerminalSessionDropdown } from "./components/TerminalPane/components/TerminalSessionDropdown";

function getFileName(filePath: string): string {
	return getBaseName(filePath);
}

function FilePaneTabTitle({
	filePath,
	isActive,
	pinned,
	workspaceId,
}: {
	filePath: string;
	isActive: boolean;
	pinned: boolean;
	workspaceId: string;
}) {
	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});
	const name = getFileName(filePath);
	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-1.5 text-xs transition-colors duration-150",
				isActive ? "text-foreground" : "text-muted-foreground",
			)}
			title={filePath}
		>
			<FileIcon fileName={name} className="size-3.5 shrink-0" />
			<span className={cn("min-w-0 truncate", !pinned && "italic")}>
				{name}
			</span>
			{document.dirty && (
				<Circle className="size-2 shrink-0 fill-current text-muted-foreground" />
			)}
		</div>
	);
}

const MOD_KEY = navigator.platform.toLowerCase().includes("mac")
	? "⌘"
	: "Ctrl+";

interface UsePaneRegistryOptions {
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onRevealPath: (path: string) => void;
}

export function usePaneRegistry(
	workspaceId: string,
	{ onOpenFile, onRevealPath }: UsePaneRegistryOptions,
): PaneRegistry<PaneViewerData> {
	const clearShortcut = useHotkeyDisplay("CLEAR_TERMINAL").text;
	const scrollToBottomShortcut = useHotkeyDisplay("SCROLL_TO_BOTTOM").text;
	const workspaceTrpcUtils = workspaceTrpc.useUtils();
	const { mutate: killTerminalSession, isPending: isKillingTerminalSession } =
		workspaceTrpc.terminal.killSession.useMutation({
			onSuccess: () => {
				toast.success("Terminal session killed");
				void workspaceTrpcUtils.terminal.listSessions.invalidate({
					workspaceId,
				});
			},
			onError: (error) => {
				toast.error("Failed to kill terminal session", {
					description: error.message,
				});
			},
		});
	// onAfterClose-driven kill: silent on both success and failure, since
	// the user's intent was already expressed by closing the pane.
	const { mutate: killTerminalSessionSilently } =
		workspaceTrpc.terminal.killSession.useMutation({
			onSuccess: () => {
				void workspaceTrpcUtils.terminal.listSessions.invalidate({
					workspaceId,
				});
			},
			onError: (error) => {
				console.warn("Failed to kill removed terminal session", {
					workspaceId,
					error,
				});
			},
		});

	return useMemo<PaneRegistry<PaneViewerData>>(
		() => ({
			file: {
				getIcon: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					const name = getFileName(data.filePath);
					return <FileIcon fileName={name} className="size-4" />;
				},
				getTitle: (pane) => getFileName((pane.data as FilePaneData).filePath),
				renderTitle: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					return (
						<FilePaneTabTitle
							filePath={data.filePath}
							isActive={ctx.isActive}
							pinned={Boolean(ctx.pane.pinned)}
							workspaceId={workspaceId}
						/>
					);
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<FilePane context={ctx} workspaceId={workspaceId} />
				),
				renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => (
					<FilePaneHeaderExtras context={ctx} workspaceId={workspaceId} />
				),
				onHeaderClick: (ctx: RendererContext<PaneViewerData>) =>
					ctx.actions.pin(),
				onBeforeClose: (pane) => {
					const data = pane.data as FilePaneData;
					const doc = getDocument(workspaceId, data.filePath);
					if (!doc?.dirty) return true;
					const name = getFileName(data.filePath);
					return new Promise<boolean>((resolve) => {
						alert({
							title: `Do you want to save the changes you made to ${name}?`,
							description: "Your changes will be lost if you don't save them.",
							actions: [
								{
									label: "Save",
									onClick: async () => {
										const doc = getDocument(workspaceId, data.filePath);
										if (!doc) {
											resolve(true);
											return;
										}
										const result = await doc.save();
										// Only proceed to close if the save succeeded; otherwise
										// leave the pane open so the user can see the conflict /
										// error state and retry.
										resolve(result.status === "saved");
									},
								},
								{
									label: "Don't Save",
									variant: "secondary",
									onClick: async () => {
										const doc = getDocument(workspaceId, data.filePath);
										if (doc) await doc.reload();
										resolve(true);
									},
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
				getIcon: () => <GitCompareArrows className="size-3.5" />,
				getTitle: () => "Changes",
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<DiffPane
						context={ctx}
						workspaceId={workspaceId}
						onOpenFile={onOpenFile}
					/>
				),
				renderHeaderExtras: () => <DiffPaneHeaderExtras />,
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Diff" } : d,
					),
			},
			terminal: {
				getIcon: () => <TerminalSquare className="size-3.5" />,
				getTitle: () => "Terminal",
				onAfterClose: (pane) => {
					const { terminalId } = pane.data as TerminalPaneData;
					if (consumeTerminalBackgroundIntent(terminalId)) {
						terminalRuntimeRegistry.release(terminalId);
						return;
					}
					terminalRuntimeRegistry.dispose(terminalId);
					killTerminalSessionSilently({ terminalId, workspaceId });
				},
				renderTitle: (ctx: RendererContext<PaneViewerData>) => (
					<div className="flex min-w-0 flex-1 items-center gap-1.5">
						<TerminalSessionDropdown context={ctx} workspaceId={workspaceId} />
						<V2NotificationStatusIndicator
							workspaceId={workspaceId}
							sources={getV2NotificationSourcesForPane(ctx.pane)}
						/>
					</div>
				),
				renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => (
					<TerminalHeaderExtras context={ctx} />
				),
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<TerminalPane
						ctx={ctx}
						workspaceId={workspaceId}
						onOpenFile={onOpenFile}
						onRevealPath={onRevealPath}
					/>
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
								return !terminalRuntimeRegistry.getSelection(
									terminalId,
									ctx.pane.id,
								);
							},
							onSelect: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								const text = terminalRuntimeRegistry.getSelection(
									terminalId,
									ctx.pane.id,
								);
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
									if (text) {
										terminalRuntimeRegistry.paste(
											terminalId,
											text,
											ctx.pane.id,
										);
									}
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
								terminalRuntimeRegistry.clear(terminalId, ctx.pane.id);
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
								terminalRuntimeRegistry.scrollToBottom(terminalId, ctx.pane.id);
							},
						},
						{ key: "sep-terminal-defaults", type: "separator" },
					];

					const modifiedDefaults = defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Terminal" } : d,
					);

					const killAction: ContextMenuActionConfig<PaneViewerData> = {
						key: "kill-terminal-session",
						label: "Kill Terminal Session",
						icon: <LuPower />,
						variant: "destructive",
						disabled: isKillingTerminalSession,
						onSelect: (ctx) => {
							const { terminalId } = ctx.pane.data as TerminalPaneData;
							killTerminalSession({
								terminalId,
								workspaceId,
							});
						},
					};

					return [
						...terminalActions,
						...modifiedDefaults,
						{ key: "sep-terminal-kill", type: "separator" },
						killAction,
					];
				},
			},
			browser: {
				getIcon: () => <Globe className="size-3.5" />,
				getTitle: (pane) => {
					const data = pane.data as BrowserPaneData;
					if (data.pageTitle) return data.pageTitle;
					if (data.url && data.url !== "about:blank") {
						try {
							return new URL(data.url).host;
						} catch {}
					}
					return "Browser";
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPane ctx={ctx} />
				),
				renderToolbar: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPaneToolbar ctx={ctx} />
				),
				// Destruction handled by useGlobalBrowserLifecycle for now.
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Browser" } : d,
					),
			},
			chat: {
				getIcon: () => <MessageSquare className="size-3.5" />,
				getTitle: () => "Chat",
				renderTitle: (ctx: RendererContext<PaneViewerData>) => (
					<ChatPaneTitle context={ctx} workspaceId={workspaceId} />
				),
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as ChatPaneData;
					return (
						<ChatPane
							workspaceId={workspaceId}
							sessionId={data.sessionId}
							onSessionIdChange={(id) =>
								ctx.actions.updateData({ ...data, sessionId: id })
							}
							initialLaunchConfig={data.launchConfig ?? null}
							onConsumeLaunchConfig={() =>
								ctx.actions.updateData({ ...data, launchConfig: null })
							}
						/>
					);
				},
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Chat" } : d,
					),
			},
			comment: {
				getIcon: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as CommentPaneData;
					if (!data.avatarUrl) {
						return <MessageSquare className="size-3.5" />;
					}
					return (
						<img
							src={data.avatarUrl}
							alt=""
							className="size-3.5 rounded-full"
						/>
					);
				},
				getTitle: (pane) => {
					const data = pane.data as CommentPaneData;
					return data.authorLogin;
				},
				renderTitle: (ctx: RendererContext<PaneViewerData>) => (
					<CommentPaneTitle context={ctx} />
				),
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<CommentPane context={ctx} />
				),
				renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => (
					<CommentPaneHeaderExtras context={ctx} />
				),
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane" ? { ...d, label: "Close Comment" } : d,
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
		[
			workspaceId,
			clearShortcut,
			scrollToBottomShortcut,
			killTerminalSession,
			killTerminalSessionSilently,
			isKillingTerminalSession,
			onOpenFile,
			onRevealPath,
		],
	);
}
