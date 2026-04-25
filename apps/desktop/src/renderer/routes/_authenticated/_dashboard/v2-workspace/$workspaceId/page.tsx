import {
	type PaneActionConfig,
	Workspace,
	type WorkspaceStore,
} from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { HotkeyLabel, useHotkey } from "renderer/hotkeys";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import {
	getV2NotificationSourcesForPane,
	getV2NotificationSourcesForTab,
	useV2NotificationStore,
	useV2PaneNotificationStatus,
} from "renderer/stores/v2-notifications";
import {
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { WorkspaceNotFoundState } from "../components/WorkspaceNotFoundState";
import { AddTabMenu } from "./components/AddTabMenu";
import { V2NotificationStatusIndicator } from "./components/V2NotificationStatusIndicator";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useConsumePendingLaunch } from "./hooks/useConsumePendingLaunch";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { useRecentlyViewedFiles } from "./hooks/useRecentlyViewedFiles";
import { useV2PresetExecution } from "./hooks/useV2PresetExecution";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import {
	FileDocumentStoreProvider,
	getDocument,
} from "./state/fileDocumentStore";
import type {
	BrowserPaneData,
	ChatPaneData,
	CommentPaneData,
	DiffPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "./types";
import type { V2WorkspaceUrlOpenTarget } from "./utils/openUrlInV2Workspace";

interface WorkspaceSearch {
	terminalId?: string;
	chatSessionId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: V2WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}

function parseOpenUrlTarget(
	value: unknown,
): V2WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
		terminalId: parseNonEmptyString(raw.terminalId),
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	}),
});

function V2WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const {
		terminalId,
		chatSessionId,
		focusRequestId,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = Route.useSearch();
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
			terminalId={terminalId}
			chatSessionId={chatSessionId}
			focusRequestId={focusRequestId}
			openUrl={openUrl}
			openUrlTarget={openUrlTarget}
			openUrlRequestId={openUrlRequestId}
		/>
	);
}

/**
 * Clear post-completion attention only for the pane the user is actually
 * viewing. Clearing every review status on route entry would drop background
 * tab attention before the user has looked at that pane.
 */
function useClearActivePaneAttention({
	workspaceId,
	store,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}): void {
	const activePane = useStore(store, (state) => {
		const tab = state.tabs.find(
			(candidate) => candidate.id === state.activeTabId,
		);
		return tab?.activePaneId ? tab.panes[tab.activePaneId] : undefined;
	});
	const activePaneStatus = useV2PaneNotificationStatus(workspaceId, activePane);
	const clearSourceAttention = useV2NotificationStore(
		(state) => state.clearSourceAttention,
	);

	useEffect(() => {
		if (activePaneStatus !== "review") return;
		for (const source of getV2NotificationSourcesForPane(activePane)) {
			clearSourceAttention(source, workspaceId);
		}
	}, [activePane, activePaneStatus, clearSourceAttention, workspaceId]);
}

function WorkspaceContent({
	projectId,
	workspaceId,
	workspaceName,
	terminalId,
	chatSessionId,
	focusRequestId,
	openUrl,
	openUrlTarget,
	openUrlRequestId,
}: {
	projectId: string;
	workspaceId: string;
	workspaceName: string;
	terminalId?: string;
	chatSessionId?: string;
	focusRequestId?: string;
	openUrl?: string;
	openUrlTarget?: V2WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}) {
	const {
		preferences: v2UserPreferences,
		setRightSidebarOpen,
		setRightSidebarTab,
	} = useV2UserPreferences();
	const { store } = useV2WorkspacePaneLayout({
		projectId,
		workspaceId,
	});
	useClearActivePaneAttention({ workspaceId, store });
	const { matchedPresets, executePreset } = useV2PresetExecution({
		store,
		workspaceId,
		projectId,
	});
	useConsumePendingLaunch({ workspaceId, store });
	useConsumeAutomationRunLink({
		store,
		terminalId,
		chatSessionId,
		focusRequestId,
	});
	useConsumeOpenUrlRequest({
		store,
		url: openUrl,
		target: openUrlTarget,
		requestId: openUrlRequestId,
	});

	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath ?? "";

	const { recentFiles, recordView } = useRecentlyViewedFiles(workspaceId);

	const activeFilePanePath = useStore(store, (s) => {
		const tab = s.tabs.find((t) => t.id === s.activeTabId);
		if (!tab?.activePaneId) return undefined;
		const pane = tab.panes[tab.activePaneId];
		if (pane?.kind === "file") return (pane.data as FilePaneData).filePath;
		return undefined;
	});

	const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>(
		activeFilePanePath,
	);
	// Every reveal request is a fresh object, so the FilesTab effect keyed on
	// `pendingReveal` re-runs even when the path is the same (e.g. user
	// collapsed a folder and re-⌘-clicked it in the terminal).
	const [pendingReveal, setPendingReveal] = useState<{
		path: string;
		isDirectory: boolean;
	} | null>(null);

	useEffect(() => {
		if (activeFilePanePath !== undefined) {
			setSelectedFilePath(activeFilePanePath);
			setPendingReveal({ path: activeFilePanePath, isDirectory: false });
		}
	}, [activeFilePanePath]);

	const openFilePathsKey = useStore(store, (s) =>
		s.tabs
			.flatMap((t) =>
				Object.values(t.panes)
					.filter((p) => p.kind === "file")
					.map((p) => (p.data as FilePaneData).filePath),
			)
			.join("\u0000"),
	);
	const openFilePaths = useMemo(
		() => new Set(openFilePathsKey ? openFilePathsKey.split("\u0000") : []),
		[openFilePathsKey],
	);

	const openFilePane = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			const absoluteFilePath = worktreePath
				? toAbsoluteWorkspacePath(worktreePath, filePath)
				: filePath;
			if (worktreePath) {
				const relativePath = toRelativeWorkspacePath(
					worktreePath,
					absoluteFilePath,
				);
				if (relativePath && relativePath !== ".") {
					recordView({ relativePath, absolutePath: absoluteFilePath });
				}
			}
			const state = store.getState();
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "file",
							data: {
								filePath: absoluteFilePath,
								mode: "editor",
							} as FilePaneData,
						},
					],
				});
				return;
			}
			const active = state.getActivePane();
			if (
				active?.pane.kind === "file" &&
				(active.pane.data as FilePaneData).filePath === absoluteFilePath
			) {
				state.setPanePinned({ paneId: active.pane.id, pinned: true });
				return;
			}
			state.openPane({
				pane: {
					kind: "file",
					data: {
						filePath: absoluteFilePath,
						mode: "editor",
					} as FilePaneData,
				},
			});
		},
		[store, worktreePath, recordView],
	);

	const revealPath = useCallback(
		(path: string, options?: { isDirectory?: boolean }) => {
			setRightSidebarOpen(true);
			setRightSidebarTab("files");
			setSelectedFilePath(path);
			setPendingReveal({ path, isDirectory: options?.isDirectory === true });
		},
		[setRightSidebarOpen, setRightSidebarTab],
	);

	const paneRegistry = usePaneRegistry(workspaceId, {
		onOpenFile: openFilePane,
		onRevealPath: revealPath,
	});
	const defaultContextMenuActions = useDefaultContextMenuActions(paneRegistry);

	const openDiffPane = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			const state = store.getState();
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "diff",
							data: {
								path: filePath,
								collapsedFiles: [],
							} as DiffPaneData,
						},
					],
				});
				return;
			}
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "diff") continue;
					const prev = pane.data as DiffPaneData;
					state.setPaneData({
						paneId: pane.id,
						data: {
							...prev,
							path: filePath,
						} as PaneViewerData,
					});
					state.setActiveTab(tab.id);
					state.setActivePane({ tabId: tab.id, paneId: pane.id });
					return;
				}
			}
			state.openPane({
				pane: {
					kind: "diff",
					data: {
						path: filePath,
						collapsedFiles: [],
					} as DiffPaneData,
				},
			});
		},
		[store],
	);

	const addTerminalTab = useCallback(() => {
		store.getState().addTab({
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

	const openCommentPane = useCallback(
		(comment: CommentPaneData) => {
			const state = store.getState();
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "comment") continue;
					state.setPaneData({
						paneId: pane.id,
						data: comment as PaneViewerData,
					});
					state.setActiveTab(tab.id);
					state.setActivePane({ tabId: tab.id, paneId: pane.id });
					return;
				}
			}
			state.addTab({
				panes: [
					{
						kind: "comment",
						data: comment as PaneViewerData,
					},
				],
			});
		},
		[store],
	);

	const [quickOpenOpen, setQuickOpenOpen] = useState(false);
	const handleQuickOpen = useCallback(() => setQuickOpenOpen(true), []);

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
				tooltip: <HotkeyLabel label="Close pane" id="CLOSE_PANE" />,
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[],
	);

	const sidebarOpen = v2UserPreferences.rightSidebarOpen;

	useWorkspaceHotkeys({
		store,
		matchedPresets,
		executePreset,
		paneRegistry,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);

	return (
		<FileDocumentStoreProvider workspaceId={workspaceId}>
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
							renderTabIcon={renderBrowserTabIcon}
							renderTabAccessory={(tab) => (
								<V2NotificationStatusIndicator
									workspaceId={workspaceId}
									sources={getV2NotificationSourcesForTab(tab)}
								/>
							)}
							renderBelowTabBar={() => (
								<V2PresetsBar
									matchedPresets={matchedPresets}
									executePreset={executePreset}
								/>
							)}
							renderAddTabMenu={() => (
								<AddTabMenu
									onAddTerminal={addTerminalTab}
									onAddChat={addChatTab}
									onAddBrowser={addBrowserTab}
								/>
							)}
							renderEmptyState={() => (
								<WorkspaceEmptyState
									onOpenBrowser={addBrowserTab}
									onOpenChat={addChatTab}
									onOpenQuickOpen={handleQuickOpen}
									onOpenTerminal={addTerminalTab}
								/>
							)}
							onBeforeCloseTab={(tab) => {
								const dirtyPanes = Object.values(tab.panes).filter((p) => {
									if (p.kind !== "file") return false;
									const filePath = (p.data as FilePaneData).filePath;
									return getDocument(workspaceId, filePath)?.dirty === true;
								});
								const dirtyFileNames = dirtyPanes.map((p) =>
									(p.data as FilePaneData).filePath.split("/").pop(),
								);
								if (dirtyPanes.length === 0) return true;
								const title =
									dirtyPanes.length === 1
										? `Do you want to save the changes you made to ${dirtyFileNames[0]}?`
										: `Do you want to save changes to ${dirtyPanes.length} files?`;
								return new Promise<boolean>((resolve) => {
									alert({
										title,
										description:
											"Your changes will be lost if you don't save them.",
										actions: [
											{
												label: "Save All",
												onClick: async () => {
													for (const pane of dirtyPanes) {
														const filePath = (pane.data as FilePaneData)
															.filePath;
														const doc = getDocument(workspaceId, filePath);
														if (!doc) continue;
														const result = await doc.save();
														if (result.status !== "saved") {
															resolve(false);
															return;
														}
													}
													resolve(true);
												},
											},
											{
												label: "Don't Save",
												variant: "secondary",
												onClick: async () => {
													for (const pane of dirtyPanes) {
														const filePath = (pane.data as FilePaneData)
															.filePath;
														const doc = getDocument(workspaceId, filePath);
														if (doc) await doc.reload();
													}
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
								onSelectFile={openFilePane}
								onSelectDiffFile={openDiffPane}
								onOpenComment={openCommentPane}
								onSearch={handleQuickOpen}
								selectedFilePath={selectedFilePath}
								pendingReveal={pendingReveal}
							/>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
			<CommandPalette
				workspaceId={workspaceId}
				open={quickOpenOpen}
				onOpenChange={setQuickOpenOpen}
				onSelectFile={openFilePane}
				variant="v2"
				recentlyViewedFiles={recentFiles}
				openFilePaths={openFilePaths}
			/>
		</FileDocumentStoreProvider>
	);
}
