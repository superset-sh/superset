import {
	type LayoutNode,
	type PaneActionConfig,
	type SplitPath,
	Workspace,
} from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { useRightSidebarOpenViewWidth } from "renderer/hooks/useRightSidebarOpenViewWidth";
import { HotkeyLabel, useHotkey } from "renderer/hotkeys";
import {
	addBrowserShortcutListener,
	dispatchBrowserShortcutEvent,
} from "renderer/lib/browser-shortcut-events";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { createWorkspaceMemo } from "renderer/lib/workspace-memos";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	CommandPalette,
	useCommandPalette,
} from "renderer/screens/main/components/CommandPalette";
import { useStore } from "zustand";
import { AddTabMenu } from "./components/AddTabMenu";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import {
	getBrowserTabTitle,
	renderBrowserTabIcon,
} from "./hooks/usePaneRegistry/components/BrowserPane";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import type {
	BrowserPaneData,
	ChatPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "./types";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
});

function findPanePathInLayout(
	node: LayoutNode,
	paneId: string,
	currentPath: SplitPath = [],
): SplitPath | null {
	if (node.type === "pane") {
		return node.paneId === paneId ? currentPath : null;
	}

	const firstPath = findPanePathInLayout(node.first, paneId, [
		...currentPath,
		"first",
	]);
	if (firstPath) return firstPath;

	const secondPath = findPanePathInLayout(node.second, paneId, [
		...currentPath,
		"second",
	]);
	if (secondPath) return secondPath;

	return null;
}

function getNodeAtPathInLayout(
	node: LayoutNode,
	path: SplitPath,
): LayoutNode | null {
	if (path.length === 0) return node;
	if (node.type === "pane") return null;

	const [branch, ...rest] = path;
	return getNodeAtPathInLayout(node[branch], rest);
}

function V2WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const collections = useCollections();

	const { data: workspaces } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces?.[0] ?? null;

	if (!workspaces) {
		return <div className="flex h-full w-full" />;
	}

	if (!workspace) {
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	return (
		<WorkspaceContent
			projectId={workspace.projectId}
			workspaceId={workspace.id}
			workspaceName={workspace.name}
		/>
	);
}

function WorkspaceContent({
	projectId,
	workspaceId,
	workspaceName,
}: {
	projectId: string;
	workspaceId: string;
	workspaceName: string;
}) {
	const navigate = useNavigate();
	const { localWorkspaceState, store } = useV2WorkspacePaneLayout({
		projectId,
		workspaceId,
	});
	const paneRegistry = usePaneRegistry(workspaceId);
	const defaultContextMenuActions = useDefaultContextMenuActions();
	const rightSidebarOpenViewWidth = useRightSidebarOpenViewWidth();
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

	const selectedFilePath = useStore(store, (s) => {
		const tab = s.tabs.find((t) => t.id === s.activeTabId);
		if (!tab?.activePaneId) return undefined;
		const pane = tab.panes[tab.activePaneId];
		if (pane?.kind === "file") return (pane.data as FilePaneData).filePath;
		return undefined;
	});

	const openFilePane = useCallback(
		(filePath: string, displayName?: string) => {
			const state = store.getState();
			const active = state.getActivePane();
			if (
				active?.pane.kind === "file" &&
				(active.pane.data as FilePaneData).filePath === filePath
			) {
				if (
					displayName &&
					(active.pane.data as FilePaneData).displayName !== displayName
				) {
					state.setPaneData({
						paneId: active.pane.id,
						data: {
							...(active.pane.data as FilePaneData),
							displayName,
						} as FilePaneData,
					});
				}
				state.setPanePinned({ paneId: active.pane.id, pinned: true });
				return;
			}
			state.openPane({
				pane: {
					kind: "file",
					data: {
						filePath,
						mode: "editor",
						hasChanges: false,
						displayName,
					} as FilePaneData,
				},
				tabTitle: "Files",
			});
		},
		[store],
	);

	const openSidebarFilePane = useCallback(
		(filePath: string) => {
			const state = store.getState();
			const active = state.getActivePane();
			const activeTab = active
				? (state.tabs.find((tab) => tab.id === active.tabId) ?? null)
				: null;
			if (
				active?.pane.kind === "file" &&
				(active.pane.data as FilePaneData).filePath === filePath
			) {
				state.setPanePinned({ paneId: active.pane.id, pinned: true });
				return;
			}

			const activeTabId = state.activeTabId;
			const activePaneId = active?.pane.id ?? null;
			const activePanePath =
				activeTab?.layout && activePaneId
					? findPanePathInLayout(activeTab.layout, activePaneId)
					: null;

			state.openPane({
				pane: {
					kind: "file",
					data: {
						filePath,
						mode: "editor",
						hasChanges: false,
					} as FilePaneData,
				},
				tabTitle: "Files",
			});

			if (!activeTabId || !activePanePath) {
				return;
			}

			const nextState = store.getState();
			const nextTab = nextState.tabs.find((tab) => tab.id === activeTabId);
			if (!nextTab) {
				return;
			}

			const splitNode = getNodeAtPathInLayout(nextTab.layout, activePanePath);
			if (splitNode?.type !== "split" || splitNode.direction !== "horizontal") {
				return;
			}

			nextState.resizeSplit({
				tabId: activeTabId,
				path: activePanePath,
				splitPercentage: 100 - rightSidebarOpenViewWidth,
			});
		},
		[rightSidebarOpenViewWidth, store],
	);

	const addTerminalTab = useCallback(() => {
		store.getState().addTab({
			titleOverride: "Terminal",
			panes: [
				{
					kind: "terminal",
					data: {
						terminalId: crypto.randomUUID(),
					} as TerminalPaneData,
				},
			],
		});
	}, [store]);

	const addChatTab = useCallback(() => {
		store.getState().addTab({
			titleOverride: "Chat",
			panes: [
				{
					kind: "chat",
					data: { sessionId: null } as ChatPaneData,
				},
			],
		});
	}, [store]);

	const addBrowserTab = useCallback(() => {
		store.getState().addTab({
			titleOverride: "Browser",
			panes: [
				{
					kind: "browser",
					data: {
						url: "about:blank",
					} as BrowserPaneData,
				},
			],
		});
	}, [store]);

	const addMemoTab = useCallback(() => {
		void createWorkspaceMemo(workspaceId)
			.then((memo) => {
				openFilePane(memo.memoFileAbsolutePath, memo.displayName);
			})
			.catch((error: Error) => {
				toast.error(`Failed to create memo: ${error.message}`);
			});
	}, [openFilePane, workspaceId]);

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

	const defaultPaneActions = useMemo<PaneActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split",
				icon: (ctx) =>
					ctx.pane.parentDirection === "horizontal" ? (
						<TbLayoutRows className="size-3.5" />
					) : (
						<TbLayoutColumns className="size-3.5" />
					),
				tooltip: <HotkeyLabel label="Split pane" id="SPLIT_AUTO" />,
				onClick: (ctx) => {
					const position =
						ctx.pane.parentDirection === "horizontal" ? "down" : "right";
					ctx.actions.split(position, {
						kind: "terminal",
						data: {
							terminalId: crypto.randomUUID(),
						} as TerminalPaneData,
					});
				},
			},
			{
				key: "close",
				icon: <HiMiniXMark className="size-3.5" />,
				tooltip: <HotkeyLabel label="Close pane" id="CLOSE_TERMINAL" />,
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[],
	);

	const sidebarOpen = localWorkspaceState?.rightSidebarOpen ?? false;

	useWorkspaceHotkeys({ store, workspaceId });
	useHotkey("QUICK_OPEN", handleQuickOpen);
	// FORK NOTE: SEARCH_IN_FILES opens CommandPalette in v2 (equivalent to classic's right sidebar search tab)
	useHotkey("SEARCH_IN_FILES", handleQuickOpen);
	// FORK NOTE: useHotkey wiring so remapped keys also trigger browser reload
	useHotkey("BROWSER_RELOAD", () => dispatchBrowserShortcutEvent("reload"));
	useHotkey("BROWSER_HARD_RELOAD", () =>
		dispatchBrowserShortcutEvent("hard-reload"),
	);

	// FORK NOTE: BROWSER_RELOAD / BROWSER_HARD_RELOAD support for v2 workspace.
	// Hard reload appends a cache-bust query param; normal reload just swaps the key.
	useEffect(() => {
		return addBrowserShortcutListener((action) => {
			const activePane = store.getState().getActivePane();
			if (!activePane || activePane.pane.kind !== "browser") {
				return;
			}

			const data = activePane.pane.data as BrowserPaneData;
			const isHard = action === "hard-reload";
			store.getState().setPaneData({
				paneId: activePane.pane.id,
				data: {
					...data,
					reloadToken: crypto.randomUUID(),
					...(isHard && { hardReloadToken: crypto.randomUUID() }),
				} as PaneViewerData,
			});
		});
	}, [store]);

	return (
		<>
			<ResizablePanelGroup direction="horizontal" className="flex-1">
				<ResizablePanel defaultSize={80} minSize={30}>
					<div
						className="flex min-h-0 min-w-0 h-full flex-col overflow-hidden"
						data-workspace-id={workspaceId}
					>
						<Workspace<PaneViewerData>
							registry={paneRegistry}
							paneActions={defaultPaneActions}
							contextMenuActions={defaultContextMenuActions}
							getTabTitle={getBrowserTabTitle}
							renderTabIcon={renderBrowserTabIcon}
							renderBelowTabBar={() => (
								<V2PresetsBar
									workspaceId={workspaceId}
									projectId={projectId}
									store={store}
								/>
							)}
							renderAddTabMenu={() => (
								<AddTabMenu
									onAddTerminal={addTerminalTab}
									onAddChat={addChatTab}
									onAddBrowser={addBrowserTab}
									onAddMemo={addMemoTab}
									showPresetsBar={showPresetsBar ?? false}
									onTogglePresetsBar={(enabled) =>
										setShowPresetsBar.mutate({ enabled })
									}
								/>
							)}
							renderEmptyState={() => (
								<WorkspaceEmptyState
									onOpenBrowser={addBrowserTab}
									onOpenChat={addChatTab}
									onOpenMemo={addMemoTab}
									onOpenQuickOpen={handleQuickOpen}
									onOpenTerminal={addTerminalTab}
								/>
							)}
							onBeforeCloseTab={(tab) => {
								const dirtyFiles = Object.values(tab.panes)
									.filter(
										(p) =>
											p.kind === "file" && (p.data as FilePaneData).hasChanges,
									)
									.map((p) =>
										(p.data as FilePaneData).filePath.split("/").pop(),
									);
								if (dirtyFiles.length === 0) return true;
								const title =
									dirtyFiles.length === 1
										? `Do you want to save the changes you made to ${dirtyFiles[0]}?`
										: `Do you want to save changes to ${dirtyFiles.length} files?`;
								return new Promise<boolean>((resolve) => {
									alert({
										title,
										description:
											"Your changes will be lost if you don't save them.",
										actions: [
											{
												label: "Cancel",
												variant: "outline",
												onClick: () => resolve(false),
											},
											{
												label: "Discard Changes",
												variant: "destructive",
												onClick: () => resolve(true),
											},
										],
										onDismiss: () => resolve(false),
									});
								});
							}}
							store={store}
						/>
					</div>
				</ResizablePanel>
				{sidebarOpen && (
					<>
						<ResizableHandle />
						<ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
							<WorkspaceSidebar
								workspaceId={workspaceId}
								workspaceName={workspaceName}
								onSelectFile={openSidebarFilePane}
								onSearch={handleQuickOpen}
								selectedFilePath={selectedFilePath}
							/>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
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
