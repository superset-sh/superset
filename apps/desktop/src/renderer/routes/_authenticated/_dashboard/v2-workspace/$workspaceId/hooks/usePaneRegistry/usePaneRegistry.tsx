import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type {
	ContextMenuActionConfig,
	PaneRegistry,
	RendererContext,
	WorkspaceStore,
} from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	Circle,
	FileText,
	GitCompareArrows,
	Globe,
	MessageSquare,
	Monitor,
} from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useMemo } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
	LuPower,
} from "react-icons/lu";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { FileIcon } from "renderer/lib/fileIcons";
import { getBaseName } from "renderer/lib/pathBasename";
import {
	confirmCloseTerminals,
	probeTerminalRunning,
} from "renderer/lib/terminal/confirm-close-terminals";
import { consumeTerminalBackgroundIntent } from "renderer/lib/terminal/terminal-background-intents";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getV2NotificationSourcesForPane } from "renderer/stores/v2-notifications";
import type { StoreApi } from "zustand/vanilla";
import { V2NotificationStatusIndicator } from "../../components/V2NotificationStatusIndicator";
import {
	getDocument,
	useSharedFileDocument,
} from "../../state/fileDocumentStore";
import type {
	BrowserPaneData,
	ChatV3PaneData,
	CommentPaneData,
	DevtoolsPaneData,
	FilePaneData,
	PagePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";
import type { TerminalLauncher } from "../useV2TerminalLauncher";
import { BrowserPane, BrowserPaneToolbar } from "./components/BrowserPane";
import { ChatV3Pane } from "./components/ChatV3Pane";
import { CommentPane } from "./components/CommentPane";
import { CommentPaneHeaderExtras } from "./components/CommentPane/components/CommentPaneHeaderExtras";
import { CommentPaneTitle } from "./components/CommentPane/components/CommentPaneTitle";
import { DesktopPane } from "./components/DesktopPane";
import { DiffPane } from "./components/DiffPane";
import { DiffPaneHeaderExtras } from "./components/DiffPane/components/DiffPaneHeaderExtras";
import { FilePane } from "./components/FilePane";
import { FilePaneHeaderExtras } from "./components/FilePane/components/FilePaneHeaderExtras";
import { PagePane } from "./components/PagePane";
import { PagePaneHeaderExtras } from "./components/PagePaneHeaderExtras";
import { PagePaneTitle } from "./components/PagePaneTitle";
import { TerminalPane } from "./components/TerminalPane";
import { TerminalPaneHeaderExtras } from "./components/TerminalPane/components/TerminalPaneHeaderExtras";
import { TerminalPaneIcon } from "./components/TerminalPane/components/TerminalPaneIcon";
import { TerminalSessionDropdown } from "./components/TerminalPane/components/TerminalSessionDropdown";
import { pagePaneLabel } from "./utils/pagePaneLabel";

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
	launcher: TerminalLauncher;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

export function usePaneRegistry({
	onOpenFile,
	onRevealPath,
	launcher,
	store,
}: UsePaneRegistryOptions): PaneRegistry<PaneViewerData> {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const isChatV3Enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHAT_V3) ?? false;
	const host = useWorkspaceHostTarget(workspaceId);
	const sandboxUrl =
		host.status === "ready" && host.kind === "sandbox" ? host.url : null;
	const isPagesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES) ?? false;
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const collections = useCollections();
	const clearShortcut = useHotkeyDisplay("CLEAR_TERMINAL").text;
	const scrollToBottomShortcut = useHotkeyDisplay("SCROLL_TO_BOTTOM").text;
	const workspaceTrpcUtils = workspaceTrpc.useUtils();
	const { mutate: killTerminalSession, isPending: isKillingTerminalSession } =
		workspaceTrpc.terminal.killSession.useMutation({
			onSuccess: () => {
				toast.success(
					t({
						message: "Terminal session killed",
					}),
				);
				void workspaceTrpcUtils.terminal.list.invalidate({
					workspaceId,
				});
			},
			onError: (error) => {
				toast.error(
					t({
						message: "Failed to kill terminal session",
					}),
					{
						description: errorMessage(error),
					},
				);
			},
		});
	// onAfterClose-driven kill: silent on both success and failure, since
	// the user's intent was already expressed by closing the pane.
	const { mutate: killTerminalSessionSilently } =
		workspaceTrpc.terminal.killSession.useMutation({
			onSuccess: () => {
				void workspaceTrpcUtils.terminal.list.invalidate({
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
	const clearWorkspaceRunTerminal = useMemo(
		() => (terminalId: string) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				if (!draft.workspaceRunTerminals?.[terminalId]) return;
				delete draft.workspaceRunTerminals[terminalId];
			});
		},
		[collections.v2WorkspaceLocalState, workspaceId],
	);

	const createNewAgentSession = useCallback(
		async (input: {
			configId: string;
			placement: "split-pane" | "new-tab";
			prompt: string;
			forkSessionId?: string;
		}): Promise<{ terminalId: string } | null> => {
			try {
				// Host pipeline bakes the prompt into the initialCommand using the
				// agent's argv/stdin transport — no follow-up writeInput needed,
				// no bind-wait race vs. the launching shell.
				const result = await runAgent.mutateAsync({
					workspaceId,
					agent: input.configId,
					prompt: input.prompt,
					...(input.forkSessionId
						? { forkSessionId: input.forkSessionId }
						: {}),
				});
				if (result.kind !== "terminal") {
					toast.error(
						t({
							message: "Selected agent isn't a terminal agent",
						}),
					);
					return null;
				}
				const terminalId = result.sessionId;
				const state = store.getState();
				const pane = {
					kind: "terminal" as const,
					titleOverride: result.label,
					data: { terminalId } as TerminalPaneData,
				};
				if (input.placement === "split-pane" && state.activeTabId) {
					state.addPane({ tabId: state.activeTabId, pane });
				} else {
					state.addTab({ panes: [pane] });
				}
				return { terminalId };
			} catch (error) {
				const description = errorMessage(
					error,
					t({
						message: "Unknown error",
					}),
				);
				toast.error(
					t({
						message: "Couldn't start agent session",
					}),
					{ description },
				);
				return null;
			}
		},
		[runAgent, store, workspaceId, t],
	);

	const focusAgentTerminal = useCallback(
		(terminalId: string) => {
			focusOrAddTerminalPane(store, terminalId);
		},
		[store],
	);

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
							title: t({
								message: `Do you want to save the changes you made to ${name}?`,
							}),
							description: t({
								message: "Your changes will be lost if you don't save them.",
							}),
							actions: [
								{
									label: t({
										message: "Save",
									}),
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
									label: t({
										message: "Don't Save",
									}),
									variant: "secondary",
									onClick: async () => {
										const doc = getDocument(workspaceId, data.filePath);
										if (doc) await doc.reload();
										resolve(true);
									},
								},
								{
									label: t({
										message: "Cancel",
									}),
									variant: "ghost",
									onClick: () => resolve(false),
								},
							],
						});
					});
				},
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										message: "Close File",
									}),
								}
							: d,
					),
			},
			diff: {
				getIcon: () => <GitCompareArrows className="size-3.5" />,
				getTitle: () => t({ message: "Changes" }),
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<DiffPane
						context={ctx}
						workspaceId={workspaceId}
						onOpenFile={onOpenFile}
						onCreateNewAgentSession={createNewAgentSession}
					/>
				),
				renderHeaderExtras: () => (
					<DiffPaneHeaderExtras workspaceId={workspaceId} />
				),
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										message: "Close Diff",
									}),
								}
							: d,
					),
			},
			terminal: {
				getIcon: (ctx) => {
					const { terminalId } = ctx.pane.data as TerminalPaneData;
					return (
						<TerminalPaneIcon
							workspaceId={workspaceId}
							terminalId={terminalId}
						/>
					);
				},
				getTitle: () =>
					t({
						message: "Terminal",
					}),
				titleSource: (pane) => {
					const { terminalId } = pane.data as TerminalPaneData;
					const instanceId = pane.id;
					return {
						subscribe: (callback) =>
							terminalRuntimeRegistry.onTitleChange(
								terminalId,
								callback,
								instanceId,
							),
						getSnapshot: () =>
							terminalRuntimeRegistry
								.getTitle(terminalId, instanceId)
								?.trim() || undefined,
					};
				},
				onBeforeClose: (pane) => {
					const { terminalId } = pane.data as TerminalPaneData;
					return confirmCloseTerminals(
						[terminalId],
						(id) => probeTerminalRunning(workspaceTrpcUtils, workspaceId, id),
						{
							title: t({
								message: "A process is still running in this terminal",
							}),
							description: t({
								message: "Closing this terminal will end the running process.",
							}),
							confirmLabel: t({
								message: "Close terminal",
							}),
						},
					);
				},
				onAfterClose: (pane) => {
					const { terminalId } = pane.data as TerminalPaneData;
					if (consumeTerminalBackgroundIntent(terminalId)) {
						terminalRuntimeRegistry.release(terminalId);
						return;
					}
					clearWorkspaceRunTerminal(terminalId);
					terminalRuntimeRegistry.dispose(terminalId);
					killTerminalSessionSilently({ terminalId, workspaceId });
				},
				renderTitle: (ctx: RendererContext<PaneViewerData>) => (
					<div className="flex min-w-0 flex-1 items-center gap-1.5">
						<TerminalSessionDropdown
							context={ctx}
							launcher={launcher}
							workspaceId={workspaceId}
						/>
						<V2NotificationStatusIndicator
							sources={getV2NotificationSourcesForPane(ctx.pane)}
						/>
					</div>
				),
				renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => {
					const { terminalId } = ctx.pane.data as TerminalPaneData;
					return (
						<TerminalPaneHeaderExtras
							workspaceId={workspaceId}
							terminalId={terminalId}
							terminalInstanceId={ctx.pane.id}
							onCreateNewAgentSession={createNewAgentSession}
						/>
					);
				},
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
							label: t({ message: "Copy" }),
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
							label: t({
								message: "Paste",
							}),
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
							label: t({
								message: "Clear Terminal",
							}),
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
							label: t({
								message: "Scroll to Bottom",
							}),
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
						d.key === "close-pane"
							? {
									...d,
									label: t({
										message: "Close Terminal",
									}),
								}
							: d,
					);

					const killAction: ContextMenuActionConfig<PaneViewerData> = {
						key: "kill-terminal-session",
						label: t({
							message: "Kill Terminal Session",
						}),
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
					return t({
						message: "Browser",
					});
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPane
						ctx={ctx}
						onCreateNewAgentSession={createNewAgentSession}
						onFocusAgentTerminal={focusAgentTerminal}
					/>
				),
				renderToolbar: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPaneToolbar ctx={ctx} />
				),
				// Destruction handled by useGlobalBrowserLifecycle for now.
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										message: "Close Browser",
									}),
								}
							: d,
					),
			},
			...(sandboxUrl
				? {
						desktop: {
							getIcon: () => <Monitor className="size-3.5" />,
							getTitle: () =>
								t({
									message: "Desktop",
								}),
							renderPane: () => <DesktopPane hostUrl={sandboxUrl} />,
						},
					}
				: {}),
			...(isChatV3Enabled
				? {
						"chat-v3": {
							getIcon: () => <MessageSquare className="size-3.5" />,
							getTitle: () =>
								t({
									message: "Chat v3",
								}),
							renderPane: (ctx: RendererContext<PaneViewerData>) => {
								const data = ctx.pane.data as ChatV3PaneData;
								return (
									<ChatV3Pane
										workspaceId={workspaceId}
										sessionId={data.sessionId}
										onSessionIdChange={(id) =>
											ctx.actions.updateData({ ...data, sessionId: id })
										}
									/>
								);
							},
							contextMenuActions: (
								_ctx: RendererContext<PaneViewerData>,
								defaults: ContextMenuActionConfig<PaneViewerData>[],
							) =>
								defaults.map((d) =>
									d.key === "close-pane"
										? {
												...d,
												label: t({
													message: "Close Chat",
												}),
											}
										: d,
								),
						},
					}
				: {}),
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
						d.key === "close-pane"
							? {
									...d,
									label: t({
										message: "Close Comment",
									}),
								}
							: d,
					),
			},
			...(isPagesEnabled
				? {
						page: {
							getIcon: () => <FileText className="size-3.5" />,
							getTitle: (pane) => pagePaneLabel(pane.data as PagePaneData),
							renderTitle: (ctx: RendererContext<PaneViewerData>) => (
								<PagePaneTitle
									data={ctx.pane.data as PagePaneData}
									paneId={ctx.pane.id}
									onClose={() => ctx.actions.close()}
								/>
							),
							renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => (
								<PagePaneHeaderExtras
									data={ctx.pane.data as PagePaneData}
									paneId={ctx.pane.id}
									workspaceId={workspaceId}
								/>
							),
							renderPane: (ctx: RendererContext<PaneViewerData>) => (
								<PagePane
									data={ctx.pane.data as PagePaneData}
									paneId={ctx.pane.id}
									onDataChange={(data) =>
										ctx.actions.updateData(data as PaneViewerData)
									}
								/>
							),
							contextMenuActions: (_ctx, defaults) =>
								defaults.map((d) =>
									d.key === "close-pane"
										? {
												...d,
												label: t({
													message: "Close Page",
												}),
											}
										: d,
								),
						},
					}
				: {}),
			devtools: {
				getTitle: () =>
					t({
						message: "DevTools",
					}),
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as DevtoolsPaneData;
					return (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							<Trans>Inspecting {data.targetTitle}</Trans>
						</div>
					);
				},
			},
		}),
		[
			workspaceId,
			isChatV3Enabled,
			isPagesEnabled,
			clearWorkspaceRunTerminal,
			clearShortcut,
			scrollToBottomShortcut,
			killTerminalSession,
			killTerminalSessionSilently,
			isKillingTerminalSession,
			launcher,
			onOpenFile,
			onRevealPath,
			createNewAgentSession,
			focusAgentTerminal,
			workspaceTrpcUtils,
			t,
			sandboxUrl,
		],
	);
}
