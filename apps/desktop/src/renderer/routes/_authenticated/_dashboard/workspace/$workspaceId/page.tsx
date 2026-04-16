import type { ExternalApp } from "@superset/local-db";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useFileOpenMode } from "renderer/hooks/useFileOpenMode";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { usePresets } from "renderer/react-query/presets";
import type { WorkspaceSearchParams } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { usePresetHotkeys } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys";
import { useWorkspaceRunCommand } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useWorkspaceRunCommand";
import { NotFound } from "renderer/routes/not-found";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { UnsavedChangesDialog } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/UnsavedChangesDialog";
import { useWorkspaceFileEventBridge } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useWorkspaceRenameReconciliation } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceRenameReconciliation";
import { WorkspaceInitializingView } from "renderer/screens/main/components/WorkspaceView/WorkspaceInitializingView";
import { WorkspaceLayout } from "renderer/screens/main/components/WorkspaceView/WorkspaceLayout";
import { useCreateOrOpenPR, usePRStatus } from "renderer/screens/main/hooks";
import {
	cancelPendingTabClose,
	discardAndClosePendingTab,
	requestPaneClose,
	requestTabClose,
	saveAndClosePendingTab,
} from "renderer/stores/editor-state/editorCoordinator";
import { useEditorSessionsStore } from "renderer/stores/editor-state/useEditorSessionsStore";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import { getPaneDimensions } from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	type FocusDirection,
	findPanePath,
	getFirstPaneId,
	getSpatialNeighborMosaicPaneId,
	resolveActiveTabIdForWorkspace,
} from "renderer/stores/tabs/utils";
import {
	useHasWorkspaceFailed,
	useIsWorkspaceInitializing,
} from "renderer/stores/workspace-init";

const EMPTY_HISTORY_STACK: string[] = [];

export const Route = createFileRoute(
	"/_authenticated/_dashboard/workspace/$workspaceId/",
)({
	component: WorkspacePage,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): WorkspaceSearchParams => ({
		tabId: typeof search.tabId === "string" ? search.tabId : undefined,
		paneId: typeof search.paneId === "string" ? search.paneId : undefined,
	}),
	loader: async ({ params, context }) => {
		const queryKey = [
			["workspaces", "get"],
			{ input: { id: params.workspaceId }, type: "query" },
		];

		try {
			await context.queryClient.ensureQueryData({
				queryKey,
				queryFn: () =>
					trpcClient.workspaces.get.query({ id: params.workspaceId }),
			});
		} catch (error) {
			// If workspace not found, throw notFound() to render 404 page
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			// Re-throw other errors
			throw error;
		}
	},
});

function WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const { data: workspace } = electronTrpc.workspaces.get.useQuery({
		id: workspaceId,
	});
	useWorkspaceFileEventBridge(
		workspaceId,
		workspace?.worktreePath,
		Boolean(workspace?.worktreePath),
	);
	useWorkspaceRenameReconciliation({
		workspaceId,
		worktreePath: workspace?.worktreePath,
		enabled: Boolean(workspace?.worktreePath),
	});
	const navigate = useNavigate();
	const routeNavigate = Route.useNavigate();
	const { tabId: searchTabId, paneId: searchPaneId } = Route.useSearch();

	// Keep the file open mode cache warm for addFileViewerPane
	useFileOpenMode();

	// Handle search-param-driven tab/pane activation (e.g. from notification clicks)
	useEffect(() => {
		if (!searchTabId) return;

		const state = useTabsStore.getState();
		const tab = state.tabs.find(
			(t) => t.id === searchTabId && t.workspaceId === workspaceId,
		);
		if (!tab) return;

		state.setActiveTab(workspaceId, searchTabId);

		if (searchPaneId && state.panes[searchPaneId]) {
			state.setFocusedPane(searchTabId, searchPaneId);
		}

		routeNavigate({ search: {}, replace: true });
	}, [searchTabId, searchPaneId, workspaceId, routeNavigate]);

	// Check if workspace is initializing or failed
	const isInitializing = useIsWorkspaceInitializing(workspaceId);
	const hasFailed = useHasWorkspaceFailed(workspaceId);

	// Check for incomplete init after app restart
	const gitStatus = workspace?.worktree?.gitStatus;
	const hasIncompleteInit =
		workspace?.type === "worktree" &&
		(gitStatus === null || gitStatus === undefined);

	// Show full-screen initialization view for:
	// - Actively initializing workspaces (shows progress)
	// - Failed workspaces (shows error with retry)
	// - Interrupted workspaces that aren't currently initializing (shows resume option)
	const showInitView = isInitializing || hasFailed || hasIncompleteInit;

	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIdForWorkspace = useTabsStore(
		(s) => s.activeTabIds[workspaceId] ?? null,
	);
	const tabHistoryStack = useTabsStore(
		(s) => s.tabHistoryStacks[workspaceId] ?? EMPTY_HISTORY_STACK,
	);
	const {
		addTab,
		splitPaneAuto,
		splitPaneVertical,
		splitPaneHorizontal,
		openPreset,
	} = useTabsWithPresets(workspace?.projectId);
	const addChatTab = useTabsStore((s) => s.addChatTab);
	const reopenClosedTab = useTabsStore((s) => s.reopenClosedTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);
	const isSidebarOpen = useSidebarStore((s) => s.isSidebarOpen);
	const setSidebarOpen = useSidebarStore((s) => s.setSidebarOpen);
	const currentSidebarMode = useSidebarStore((s) => s.currentMode);
	const setSidebarMode = useSidebarStore((s) => s.setMode);

	const tabs = useMemo(
		() => allTabs.filter((tab) => tab.workspaceId === workspaceId),
		[workspaceId, allTabs],
	);

	const activeTabId = useMemo(() => {
		return resolveActiveTabIdForWorkspace({
			workspaceId,
			tabs,
			activeTabIds: { [workspaceId]: activeTabIdForWorkspace },
			tabHistoryStacks: { [workspaceId]: tabHistoryStack },
		});
	}, [workspaceId, tabs, activeTabIdForWorkspace, tabHistoryStack]);

	const activeTab = useMemo(
		() => (activeTabId ? tabs.find((t) => t.id === activeTabId) : null),
		[activeTabId, tabs],
	);

	const focusedPaneId = useTabsStore((s) =>
		activeTabId ? (s.focusedPaneIds[activeTabId] ?? null) : null,
	);
	const pendingTabClose = useEditorSessionsStore((s) =>
		s.pendingTabClose?.workspaceId === workspaceId ? s.pendingTabClose : null,
	);

	const { toggleWorkspaceRun } = useWorkspaceRunCommand({
		workspaceId,
		worktreePath: workspace?.worktreePath,
	});

	const { matchedPresets: presets } = usePresets(workspace?.projectId);

	const openTabWithPreset = useCallback(
		(presetIndex: number) => {
			const preset = presets[presetIndex];
			if (preset) {
				openPreset(workspaceId, preset, { target: "active-tab" });
			} else {
				addTab(workspaceId);
			}
		},
		[presets, workspaceId, addTab, openPreset],
	);

	useHotkey("NEW_GROUP", () => addTab(workspaceId));
	useHotkey("NEW_CHAT", () => addChatTab(workspaceId));
	useHotkey("REOPEN_TAB", () => {
		if (!reopenClosedTab(workspaceId)) {
			addChatTab(workspaceId);
		}
	});
	useHotkey("NEW_BROWSER", () => addBrowserTab(workspaceId));
	usePresetHotkeys(openTabWithPreset);

	useHotkey("RUN_WORKSPACE_COMMAND", () => toggleWorkspaceRun());

	useHotkey("CLOSE_TERMINAL", () => {
		if (focusedPaneId) {
			requestPaneClose(focusedPaneId);
		}
	});
	useHotkey("CLOSE_TAB", () => {
		if (activeTabId) {
			requestTabClose(activeTabId);
		}
	});

	useHotkey("PREV_TAB", () => {
		if (!activeTabId || tabs.length === 0) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		const prevIndex = index <= 0 ? tabs.length - 1 : index - 1;
		setActiveTab(workspaceId, tabs[prevIndex].id);
	});

	useHotkey("NEXT_TAB", () => {
		if (!activeTabId || tabs.length === 0) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		const nextIndex = index >= tabs.length - 1 || index === -1 ? 0 : index + 1;
		setActiveTab(workspaceId, tabs[nextIndex].id);
	});

	useHotkey("PREV_TAB_ALT", () => {
		if (!activeTabId || tabs.length === 0) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		const prevIndex = index <= 0 ? tabs.length - 1 : index - 1;
		setActiveTab(workspaceId, tabs[prevIndex].id);
	});

	useHotkey("NEXT_TAB_ALT", () => {
		if (!activeTabId || tabs.length === 0) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		const nextIndex = index >= tabs.length - 1 || index === -1 ? 0 : index + 1;
		setActiveTab(workspaceId, tabs[nextIndex].id);
	});

	const switchToTab = useCallback(
		(index: number) => {
			const tab = tabs[index];
			if (tab) {
				setActiveTab(workspaceId, tab.id);
			}
		},
		[tabs, workspaceId, setActiveTab],
	);

	useHotkey("JUMP_TO_TAB_1", () => switchToTab(0));
	useHotkey("JUMP_TO_TAB_2", () => switchToTab(1));
	useHotkey("JUMP_TO_TAB_3", () => switchToTab(2));
	useHotkey("JUMP_TO_TAB_4", () => switchToTab(3));
	useHotkey("JUMP_TO_TAB_5", () => switchToTab(4));
	useHotkey("JUMP_TO_TAB_6", () => switchToTab(5));
	useHotkey("JUMP_TO_TAB_7", () => switchToTab(6));
	useHotkey("JUMP_TO_TAB_8", () => switchToTab(7));
	useHotkey("JUMP_TO_TAB_9", () => switchToTab(8));

	// Open in last used app shortcut
	const projectId = workspace?.projectId;
	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId: projectId as string },
		{ enabled: !!projectId },
	);
	const resolvedDefaultApp: ExternalApp = defaultApp ?? "cursor";
	const utils = electronTrpc.useUtils();
	const { mutate: mutateOpenInApp } =
		electronTrpc.external.openInApp.useMutation({
			onSuccess: () => {
				if (projectId) {
					utils.projects.getDefaultApp.invalidate({ projectId });
				}
			},
		});
	const handleOpenInApp = useCallback(() => {
		if (workspace?.worktreePath) {
			mutateOpenInApp({
				path: workspace.worktreePath,
				app: resolvedDefaultApp,
				projectId,
			});
		}
	}, [workspace?.worktreePath, resolvedDefaultApp, mutateOpenInApp, projectId]);
	useHotkey("OPEN_IN_APP", handleOpenInApp);

	// Copy path shortcut
	const { copyToClipboard } = useCopyToClipboard();
	useHotkey("COPY_PATH", () => {
		if (workspace?.worktreePath) {
			copyToClipboard(workspace.worktreePath);
		}
	});

	// Open PR shortcut (⌘⇧P)
	const { pr } = usePRStatus({ workspaceId, surface: "workspace-page" });
	const { createOrOpenPR } = useCreateOrOpenPR({
		worktreePath: workspace?.worktreePath,
	});
	useHotkey("OPEN_PR", () => {
		if (pr?.url) {
			window.open(pr.url, "_blank");
		} else {
			createOrOpenPR();
		}
	});

	const [quickOpenOpen, setQuickOpenOpen] = useState(false);
	const handleQuickOpen = useCallback(() => setQuickOpenOpen(true), []);
	useHotkey("QUICK_OPEN", handleQuickOpen);

	// Toggle changes sidebar (⌘L)
	useHotkey("TOGGLE_SIDEBAR", () => toggleSidebar());

	// Toggle expand/collapse sidebar (⌘⇧L)
	useHotkey("TOGGLE_EXPAND_SIDEBAR", () => {
		if (!isSidebarOpen) {
			setSidebarOpen(true);
			setSidebarMode(SidebarMode.Changes);
		} else {
			const isExpanded = currentSidebarMode === SidebarMode.Changes;
			setSidebarMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
		}
	});

	// Pane splitting helper - resolves target pane for split operations
	const resolveSplitTarget = useCallback(
		(paneId: string, tabId: string, targetTab: Tab) => {
			const path = findPanePath(targetTab.layout, paneId);
			if (path !== null) return { path, paneId };

			const firstPaneId = getFirstPaneId(targetTab.layout);
			const firstPanePath = findPanePath(targetTab.layout, firstPaneId);
			setFocusedPane(tabId, firstPaneId);
			return { path: firstPanePath ?? [], paneId: firstPaneId };
		},
		[setFocusedPane],
	);

	// Pane splitting shortcuts
	useHotkey("SPLIT_AUTO", () => {
		if (activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			const dimensions = getPaneDimensions(target.paneId);
			if (dimensions) {
				splitPaneAuto(activeTabId, target.paneId, dimensions, target.path);
			}
		}
	});

	useHotkey("SPLIT_RIGHT", () => {
		if (activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			splitPaneVertical(activeTabId, target.paneId, target.path);
		}
	});

	useHotkey("SPLIT_DOWN", () => {
		if (activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			splitPaneHorizontal(activeTabId, target.paneId, target.path);
		}
	});

	useHotkey("SPLIT_WITH_CHAT", () => {
		if (activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			splitPaneVertical(activeTabId, target.paneId, target.path, {
				paneType: "chat",
			});
		}
	});

	useHotkey("SPLIT_WITH_BROWSER", () => {
		if (activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			splitPaneVertical(activeTabId, target.paneId, target.path, {
				paneType: "webview",
			});
		}
	});

	const equalizePaneSplits = useTabsStore((s) => s.equalizePaneSplits);
	useHotkey("EQUALIZE_PANE_SPLITS", () => {
		if (activeTabId) {
			equalizePaneSplits(activeTabId);
		}
	});

	const moveFocusDirectional = useCallback(
		(dir: FocusDirection) => {
			if (!activeTabId || !activeTab?.layout || !focusedPaneId) return;
			const neighbor = getSpatialNeighborMosaicPaneId(
				activeTab.layout,
				focusedPaneId,
				dir,
			);
			if (neighbor) setFocusedPane(activeTabId, neighbor);
		},
		[activeTabId, activeTab?.layout, focusedPaneId, setFocusedPane],
	);
	useHotkey("FOCUS_PANE_LEFT", () => moveFocusDirectional("left"));
	useHotkey("FOCUS_PANE_RIGHT", () => moveFocusDirectional("right"));
	useHotkey("FOCUS_PANE_UP", () => moveFocusDirectional("up"));
	useHotkey("FOCUS_PANE_DOWN", () => moveFocusDirectional("down"));

	const getPreviousWorkspace =
		electronTrpc.workspaces.getPreviousWorkspace.useQuery(
			{ id: workspaceId },
			{ enabled: !!workspaceId },
		);
	useHotkey("PREV_WORKSPACE", () => {
		const prevWorkspaceId = getPreviousWorkspace.data;
		if (prevWorkspaceId) {
			navigateToWorkspace(prevWorkspaceId, navigate);
		}
	});

	const getNextWorkspace = electronTrpc.workspaces.getNextWorkspace.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	useHotkey("NEXT_WORKSPACE", () => {
		const nextWorkspaceId = getNextWorkspace.data;
		if (nextWorkspaceId) {
			navigateToWorkspace(nextWorkspaceId, navigate);
		}
	});

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden">
			<div className="flex-1 min-h-0 flex overflow-hidden">
				{showInitView ? (
					<WorkspaceInitializingView
						workspaceId={workspaceId}
						workspaceName={workspace?.name ?? "Workspace"}
						isInterrupted={hasIncompleteInit && !isInitializing}
					/>
				) : (
					<WorkspaceLayout
						defaultExternalApp={resolvedDefaultApp}
						onOpenInApp={handleOpenInApp}
						onOpenQuickOpen={handleQuickOpen}
					/>
				)}
			</div>
			<CommandPalette
				workspaceId={workspaceId}
				open={quickOpenOpen}
				onOpenChange={setQuickOpenOpen}
				onSelectFile={(filePath) =>
					useTabsStore.getState().addFileViewerPane(workspaceId, { filePath })
				}
			/>
			<UnsavedChangesDialog
				open={pendingTabClose !== null}
				onOpenChange={(open) => {
					if (!open) {
						cancelPendingTabClose(workspaceId);
					}
				}}
				onSave={() => {
					void saveAndClosePendingTab(workspaceId).catch((error) => {
						console.error(
							"[WorkspacePage] Failed to save dirty files before closing tab",
							{
								workspaceId,
								error,
							},
						);
					});
				}}
				onDiscard={() => discardAndClosePendingTab(workspaceId)}
				isSaving={pendingTabClose?.isSaving ?? false}
				description={
					pendingTabClose
						? pendingTabClose.documentKeys.length === 1
							? "This tab has unsaved changes in 1 file. What would you like to do before closing it?"
							: `This tab has unsaved changes in ${pendingTabClose.documentKeys.length} files. What would you like to do before closing it?`
						: undefined
				}
				discardLabel="Discard & Close Tab"
				saveLabel="Save & Close Tab"
			/>
		</div>
	);
}
