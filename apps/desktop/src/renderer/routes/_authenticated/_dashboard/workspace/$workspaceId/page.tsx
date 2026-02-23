import { toast } from "@superset/ui/sonner";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useFileOpenMode } from "renderer/hooks/useFileOpenMode";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { usePresets } from "renderer/react-query/presets";
import type { WorkspaceSearchParams } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { usePresetHotkeys } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys";
import { NotFound } from "renderer/routes/not-found";
import {
	CommandPalette,
	useCommandPalette,
} from "renderer/screens/main/components/CommandPalette";
import { WorkspaceInitializingView } from "renderer/screens/main/components/WorkspaceView/WorkspaceInitializingView";
import { WorkspaceLayout } from "renderer/screens/main/components/WorkspaceView/WorkspaceLayout";
import { usePRStatus } from "renderer/screens/main/hooks";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import { getPaneDimensions } from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	findPanePath,
	getFirstPaneId,
	getNextPaneId,
	getPreviousPaneId,
	resolveActiveTabIdForWorkspace,
} from "renderer/stores/tabs/utils";
import {
	useHasWorkspaceFailed,
	useIsWorkspaceInitializing,
} from "renderer/stores/workspace-init";

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
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const {
		addTab,
		splitPaneAuto,
		splitPaneVertical,
		splitPaneHorizontal,
		openPreset,
	} = useTabsWithPresets();
	const addChatTab = useTabsStore((s) => s.addChatTab);
	const reopenClosedTab = useTabsStore((s) => s.reopenClosedTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const removePane = useTabsStore((s) => s.removePane);
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
			activeTabIds,
			tabHistoryStacks,
		});
	}, [workspaceId, tabs, activeTabIds, tabHistoryStacks]);

	const activeTab = useMemo(
		() => (activeTabId ? tabs.find((t) => t.id === activeTabId) : null),
		[activeTabId, tabs],
	);

	const focusedPaneId = activeTabId ? focusedPaneIds[activeTabId] : null;

	const { presets } = usePresets();

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

	useAppHotkey("NEW_GROUP", () => addTab(workspaceId), undefined, [
		workspaceId,
		addTab,
	]);
	useAppHotkey(
		"REOPEN_TAB",
		() => {
			if (!reopenClosedTab(workspaceId)) {
				addChatTab(workspaceId);
			}
		},
		undefined,
		[workspaceId, reopenClosedTab, addChatTab],
	);
	useAppHotkey("NEW_BROWSER", () => addBrowserTab(workspaceId), undefined, [
		workspaceId,
		addBrowserTab,
	]);
	usePresetHotkeys(openTabWithPreset);

	useAppHotkey(
		"CLOSE_TERMINAL",
		() => {
			if (focusedPaneId) {
				removePane(focusedPaneId);
			}
		},
		undefined,
		[focusedPaneId, removePane],
	);

	useAppHotkey(
		"PREV_TAB",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const prevIndex = index <= 0 ? tabs.length - 1 : index - 1;
			setActiveTab(workspaceId, tabs[prevIndex].id);
		},
		undefined,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"NEXT_TAB",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const nextIndex =
				index >= tabs.length - 1 || index === -1 ? 0 : index + 1;
			setActiveTab(workspaceId, tabs[nextIndex].id);
		},
		undefined,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"PREV_TAB_ALT",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const prevIndex = index <= 0 ? tabs.length - 1 : index - 1;
			setActiveTab(workspaceId, tabs[prevIndex].id);
		},
		undefined,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"NEXT_TAB_ALT",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const nextIndex =
				index >= tabs.length - 1 || index === -1 ? 0 : index + 1;
			setActiveTab(workspaceId, tabs[nextIndex].id);
		},
		undefined,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	const switchToTab = useCallback(
		(index: number) => {
			const tab = tabs[index];
			if (tab) {
				setActiveTab(workspaceId, tab.id);
			}
		},
		[tabs, workspaceId, setActiveTab],
	);

	useAppHotkey("JUMP_TO_TAB_1", () => switchToTab(0), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_2", () => switchToTab(1), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_3", () => switchToTab(2), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_4", () => switchToTab(3), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_5", () => switchToTab(4), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_6", () => switchToTab(5), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_7", () => switchToTab(6), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_8", () => switchToTab(7), undefined, [switchToTab]);
	useAppHotkey("JUMP_TO_TAB_9", () => switchToTab(8), undefined, [switchToTab]);

	useAppHotkey(
		"PREV_PANE",
		() => {
			if (!activeTabId || !activeTab?.layout || !focusedPaneId) return;
			const prevPaneId = getPreviousPaneId(activeTab.layout, focusedPaneId);
			if (prevPaneId) {
				setFocusedPane(activeTabId, prevPaneId);
			}
		},
		undefined,
		[activeTabId, activeTab?.layout, focusedPaneId, setFocusedPane],
	);

	useAppHotkey(
		"NEXT_PANE",
		() => {
			if (!activeTabId || !activeTab?.layout || !focusedPaneId) return;
			const nextPaneId = getNextPaneId(activeTab.layout, focusedPaneId);
			if (nextPaneId) {
				setFocusedPane(activeTabId, nextPaneId);
			}
		},
		undefined,
		[activeTabId, activeTab?.layout, focusedPaneId, setFocusedPane],
	);

	// Open in last used app shortcut
	const projectId = workspace?.projectId;
	const { data: defaultApp = "cursor" } =
		electronTrpc.projects.getDefaultApp.useQuery(
			{ projectId: projectId as string },
			{ enabled: !!projectId },
		);
	const utils = electronTrpc.useUtils();
	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: () => {
			if (projectId) {
				utils.projects.getDefaultApp.invalidate({ projectId });
			}
		},
	});
	useAppHotkey(
		"OPEN_IN_APP",
		() => {
			if (workspace?.worktreePath) {
				openInApp.mutate({
					path: workspace.worktreePath,
					app: defaultApp,
					projectId,
				});
			}
		},
		undefined,
		[workspace?.worktreePath, defaultApp, projectId],
	);

	// Copy path shortcut
	const copyPath = electronTrpc.external.copyPath.useMutation();
	useAppHotkey(
		"COPY_PATH",
		() => {
			if (workspace?.worktreePath) {
				copyPath.mutate(workspace.worktreePath);
			}
		},
		undefined,
		[workspace?.worktreePath],
	);

	// Open PR shortcut (⌘⇧P)
	const { pr } = usePRStatus({ workspaceId });
	const createPRMutation = electronTrpc.changes.createPR.useMutation({
		onSuccess: () => toast.success("Opening GitHub..."),
		onError: (error) => toast.error(`Failed: ${error.message}`),
	});
	useAppHotkey(
		"OPEN_PR",
		() => {
			if (pr?.url) {
				window.open(pr.url, "_blank");
			} else if (workspace?.worktreePath) {
				createPRMutation.mutate({ worktreePath: workspace.worktreePath });
			}
		},
		undefined,
		[pr?.url, workspace?.worktreePath],
	);

	const commandPalette = useCommandPalette({
		workspaceId,
		worktreePath: workspace?.worktreePath,
	});
	useAppHotkey("QUICK_OPEN", () => commandPalette.toggle(), undefined, [
		commandPalette.toggle,
	]);

	// Toggle changes sidebar (⌘L)
	useAppHotkey("TOGGLE_SIDEBAR", () => toggleSidebar(), undefined, [
		toggleSidebar,
	]);

	// Toggle expand/collapse sidebar (⌘⇧L)
	useAppHotkey(
		"TOGGLE_EXPAND_SIDEBAR",
		() => {
			if (!isSidebarOpen) {
				setSidebarOpen(true);
				setSidebarMode(SidebarMode.Changes);
			} else {
				const isExpanded = currentSidebarMode === SidebarMode.Changes;
				setSidebarMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
			}
		},
		undefined,
		[isSidebarOpen, setSidebarOpen, setSidebarMode, currentSidebarMode],
	);

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
	useAppHotkey(
		"SPLIT_AUTO",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				const dimensions = getPaneDimensions(target.paneId);
				if (dimensions) {
					splitPaneAuto(activeTabId, target.paneId, dimensions, target.path);
				}
			}
		},
		undefined,
		[activeTabId, focusedPaneId, activeTab, splitPaneAuto, resolveSplitTarget],
	);

	useAppHotkey(
		"SPLIT_RIGHT",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				splitPaneVertical(activeTabId, target.paneId, target.path);
			}
		},
		undefined,
		[
			activeTabId,
			focusedPaneId,
			activeTab,
			splitPaneVertical,
			resolveSplitTarget,
		],
	);

	useAppHotkey(
		"SPLIT_DOWN",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				splitPaneHorizontal(activeTabId, target.paneId, target.path);
			}
		},
		undefined,
		[
			activeTabId,
			focusedPaneId,
			activeTab,
			splitPaneHorizontal,
			resolveSplitTarget,
		],
	);

	// Navigate to previous workspace (⌘↑)
	const getPreviousWorkspace =
		electronTrpc.workspaces.getPreviousWorkspace.useQuery(
			{ id: workspaceId },
			{ enabled: !!workspaceId },
		);
	useAppHotkey(
		"PREV_WORKSPACE",
		() => {
			const prevWorkspaceId = getPreviousWorkspace.data;
			if (prevWorkspaceId) {
				navigateToWorkspace(prevWorkspaceId, navigate);
			}
		},
		undefined,
		[getPreviousWorkspace.data, navigate],
	);

	// Navigate to next workspace (⌘↓)
	const getNextWorkspace = electronTrpc.workspaces.getNextWorkspace.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	useAppHotkey(
		"NEXT_WORKSPACE",
		() => {
			const nextWorkspaceId = getNextWorkspace.data;
			if (nextWorkspaceId) {
				navigateToWorkspace(nextWorkspaceId, navigate);
			}
		},
		undefined,
		[getNextWorkspace.data, navigate],
	);

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
					<WorkspaceLayout />
				)}
			</div>
			<CommandPalette
				open={commandPalette.open}
				onOpenChange={commandPalette.handleOpenChange}
				query={commandPalette.query}
				onQueryChange={commandPalette.setQuery}
				searchResults={commandPalette.searchResults}
				onSelectFile={commandPalette.selectFile}
			/>
		</div>
	);
}
