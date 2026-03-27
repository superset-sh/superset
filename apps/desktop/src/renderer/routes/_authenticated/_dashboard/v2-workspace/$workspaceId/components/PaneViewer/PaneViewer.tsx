import {
	createPaneRoot,
	type PaneRegistry,
	PaneWorkspace,
} from "@superset/pane-layout";
import {
	DropdownMenuCheckboxItem,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { FileCode2, Globe, MessageSquare, TerminalSquare } from "lucide-react";
import { useCallback, useMemo } from "react";
import { BsTerminalPlus } from "react-icons/bs";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { WorkspaceChat } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat";
import { WorkspaceFilePreview } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceFiles/components/WorkspaceFilePreview/WorkspaceFilePreview";
import { WorkspaceTerminal } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceTerminal";
import {
	CommandPalette,
	useCommandPalette,
} from "renderer/screens/main/components/CommandPalette";
import { PresetsBar } from "renderer/screens/main/components/WorkspaceView/ContentView/components/PresetsBar";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { DEFAULT_SHOW_PRESETS_BAR } from "shared/constants";
import { PaneViewerEmptyState } from "./components/PaneViewerEmptyState";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import {
	type BrowserPaneData,
	type ChatPaneData,
	createBrowserPane,
	createChatPane,
	createFilePane,
	createTerminalPane,
	type DevtoolsPaneData,
	type FilePaneData,
	type PaneViewerData,
	type TerminalPaneData,
} from "./pane-viewer.model";

interface PaneViewerProps {
	projectId: string;
	workspaceId: string;
	workspaceName: string;
}

function getFileTitle(filePath: string): string {
	return filePath.split("/").pop() ?? filePath;
}

export function PaneViewer({
	projectId,
	workspaceId,
	workspaceName,
}: PaneViewerProps) {
	const navigate = useNavigate();
	const { store } = useV2WorkspacePaneLayout({
		projectId,
		workspaceId,
	});
	const utils = electronTrpc.useUtils();
	const { data: showPresetsBar } =
		electronTrpc.settings.getShowPresetsBar.useQuery();
	const setShowPresetsBar = electronTrpc.settings.setShowPresetsBar.useMutation(
		{
			onMutate: async ({ enabled }) => {
				await utils.settings.getShowPresetsBar.cancel();
				const previous = utils.settings.getShowPresetsBar.getData();
				utils.settings.getShowPresetsBar.setData(undefined, enabled);
				return { previous };
			},
			onError: (_error, _variables, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getShowPresetsBar.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getShowPresetsBar.invalidate();
			},
		},
	);

	const openFilePane = useCallback(
		(filePath: string) => {
			const pane = createFilePane({
				title: getFileTitle(filePath),
				filePath,
				mode: "editor",
				hasChanges: false,
			});
			const activePane = store.getState().getActivePane();

			if (activePane) {
				store.getState().addPaneToGroup({
					rootId: activePane.rootId,
					groupId: activePane.groupId,
					pane,
					replaceUnpinned: true,
					select: true,
				});
				return;
			}

			store.getState().addRoot(
				createPaneRoot({
					titleOverride: "Files",
					panes: [pane],
				}),
			);
		},
		[store],
	);

	const addTerminalRoot = useCallback(() => {
		store.getState().addRoot(
			createPaneRoot({
				titleOverride: "Terminal",
				panes: [
					createTerminalPane({
						title: "Terminal",
						sessionKey: `${workspaceId}:${crypto.randomUUID()}`,
						cwd: `/workspace/${workspaceName}`,
						launchMode: "workspace-shell",
					}),
				],
			}),
		);
	}, [store, workspaceId, workspaceName]);

	const addChatRoot = useCallback(() => {
		store.getState().addRoot(
			createPaneRoot({
				titleOverride: "Chat",
				panes: [
					createChatPane({
						title: "Chat",
						sessionId: null,
					}),
				],
			}),
		);
	}, [store]);

	const addBrowserRoot = useCallback(() => {
		store.getState().addRoot(
			createPaneRoot({
				titleOverride: "Browser",
				panes: [
					createBrowserPane({
						title: "Browser",
						url: "http://localhost:3000",
						mode: "preview",
					}),
				],
			}),
		);
	}, [store]);

	const commandPalette = useCommandPalette({
		workspaceId,
		navigate,
		onSelectFile: ({ close, filePath, targetWorkspaceId }) => {
			close();

			if (targetWorkspaceId !== workspaceId) {
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: targetWorkspaceId },
				});
				return;
			}

			openFilePane(filePath);
		},
	});

	const handleQuickOpen = useCallback(() => {
		commandPalette.toggle();
	}, [commandPalette]);
	const setPaneData = store.getState().setPaneData;

	const paneRegistry = useMemo<PaneRegistry<PaneViewerData>>(
		() => ({
			file: {
				getIcon: () => <FileCode2 className="size-4" />,
				renderPane: ({ pane }) => {
					const data = pane.data as FilePaneData;

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
				renderPane: ({ pane }) => {
					const _data = pane.data as TerminalPaneData;
					return <WorkspaceTerminal workspaceId={workspaceId} />;
				},
			},
			browser: {
				getIcon: () => <Globe className="size-4" />,
				renderPane: ({ pane }) => {
					const data = pane.data as BrowserPaneData;

					return (
						<iframe
							className="h-full w-full border-0 bg-background"
							src={data.url}
							title={pane.titleOverride ?? "Browser"}
						/>
					);
				},
			},
			chat: {
				getIcon: () => <MessageSquare className="size-4" />,
				renderPane: ({ pane }) => {
					const data = pane.data as ChatPaneData;
					return (
						<WorkspaceChat
							onSessionIdChange={(sessionId) =>
								setPaneData({
									paneId: pane.id,
									data: { sessionId },
								})
							}
							sessionId={data.sessionId}
							workspaceId={workspaceId}
						/>
					);
				},
			},
			devtools: {
				renderPane: ({ pane }) => {
					const data = pane.data as DevtoolsPaneData;

					return (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Inspecting {data.targetTitle}
						</div>
					);
				},
			},
		}),
		[setPaneData, workspaceId],
	);

	useAppHotkey("NEW_GROUP", addTerminalRoot, undefined, [addTerminalRoot]);
	useAppHotkey("NEW_CHAT", addChatRoot, undefined, [addChatRoot]);
	useAppHotkey("NEW_BROWSER", addBrowserRoot, undefined, [addBrowserRoot]);
	useAppHotkey("QUICK_OPEN", handleQuickOpen, undefined, [handleQuickOpen]);

	return (
		<>
			<div
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
				data-workspace-id={workspaceId}
			>
				{(showPresetsBar ?? DEFAULT_SHOW_PRESETS_BAR) ? <PresetsBar /> : null}
				<PaneWorkspace
					className="rounded-none border-0"
					onAddRoot={addTerminalRoot}
					registry={paneRegistry}
					renderAddRootMenu={() => (
						<>
							<DropdownMenuItem className="gap-2" onClick={addTerminalRoot}>
								<BsTerminalPlus className="size-4" />
								<span>Terminal</span>
								<HotkeyMenuShortcut hotkeyId="NEW_GROUP" />
							</DropdownMenuItem>
							<DropdownMenuItem className="gap-2" onClick={addChatRoot}>
								<TbMessageCirclePlus className="size-4" />
								<span>Chat</span>
								<HotkeyMenuShortcut hotkeyId="NEW_CHAT" />
							</DropdownMenuItem>
							<DropdownMenuItem className="gap-2" onClick={addBrowserRoot}>
								<TbWorld className="size-4" />
								<span>Browser</span>
								<HotkeyMenuShortcut hotkeyId="NEW_BROWSER" />
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuCheckboxItem
								checked={showPresetsBar ?? DEFAULT_SHOW_PRESETS_BAR}
								onCheckedChange={(checked) =>
									setShowPresetsBar.mutate({ enabled: checked === true })
								}
								onSelect={(event) => event.preventDefault()}
							>
								Show Preset Bar
							</DropdownMenuCheckboxItem>
						</>
					)}
					renderEmptyState={() => (
						<PaneViewerEmptyState
							onOpenBrowser={addBrowserRoot}
							onOpenChat={addChatRoot}
							onOpenQuickOpen={handleQuickOpen}
							onOpenTerminal={addTerminalRoot}
						/>
					)}
					store={store}
				/>
			</div>
			<CommandPalette
				excludePattern={commandPalette.excludePattern}
				filtersOpen={commandPalette.filtersOpen}
				includePattern={commandPalette.includePattern}
				isLoading={commandPalette.isFetching}
				onExcludePatternChange={commandPalette.setExcludePattern}
				onFiltersOpenChange={commandPalette.setFiltersOpen}
				onIncludePatternChange={commandPalette.setIncludePattern}
				onOpenChange={commandPalette.handleOpenChange}
				onQueryChange={commandPalette.setQuery}
				onScopeChange={commandPalette.setScope}
				onSelectFile={commandPalette.selectFile}
				open={commandPalette.open}
				query={commandPalette.query}
				scope={commandPalette.scope}
				searchResults={commandPalette.searchResults}
				workspaceName={workspaceName}
			/>
		</>
	);
}
