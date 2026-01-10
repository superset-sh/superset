import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useState } from "react";
import { DndProvider } from "react-dnd";
import { HiArrowPath } from "react-icons/hi2";
import { NewWorkspaceModal } from "renderer/components/NewWorkspaceModal";
import { SetupConfigModal } from "renderer/components/SetupConfigModal";
import { UpdateRequiredPage } from "renderer/components/UpdateRequiredPage";
import { useUpdateListener } from "renderer/components/UpdateToast";
import { useVersionCheck } from "renderer/hooks/useVersionCheck";
import { trpc } from "renderer/lib/trpc";
import { SignInScreen } from "renderer/screens/sign-in";
import { useCurrentView, useOpenSettings } from "renderer/stores/app-state";
import { useAppHotkey, useHotkeysSync } from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { getPaneDimensions } from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import { findPanePath, getFirstPaneId } from "renderer/stores/tabs/utils";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { dragDropManager } from "../../lib/dnd";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { ResizablePanel } from "./components/ResizablePanel";
import { SettingsView } from "./components/SettingsView";
import { StartView } from "./components/StartView";
import { TasksView } from "./components/TasksView";
import { TopBar } from "./components/TopBar";
import { WorkspaceInitEffects } from "./components/WorkspaceInitEffects";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { WorkspacesListView } from "./components/WorkspacesListView";
import { WorkspaceView } from "./components/WorkspaceView";

function LoadingSpinner() {
	return (
		<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
	);
}

export function MainScreen() {
	const utils = trpc.useUtils();

	// Version check - blocks app if outdated
	const {
		isLoading: isVersionLoading,
		isBlocked: isVersionBlocked,
		requirements: versionRequirements,
	} = useVersionCheck();

	const { data: authState } = trpc.auth.getState.useQuery();
	const isSignedIn =
		!!process.env.SKIP_ENV_VALIDATION || (authState?.isSignedIn ?? false);
	const isAuthLoading = !process.env.SKIP_ENV_VALIDATION && !authState;

	// Subscribe to auth state changes
	trpc.auth.onStateChange.useSubscription(undefined, {
		onData: () => utils.auth.getState.invalidate(),
	});

	// Subscribe to workspace initialization progress
	const updateInitProgress = useWorkspaceInitStore((s) => s.updateProgress);
	trpc.workspaces.onInitProgress.useSubscription(undefined, {
		onData: (progress) => {
			updateInitProgress(progress);
			// Invalidate workspace queries when initialization completes or fails
			if (progress.step === "ready" || progress.step === "failed") {
				utils.workspaces.getActive.invalidate();
				utils.workspaces.getAllGrouped.invalidate();
			}
		},
	});

	const currentView = useCurrentView();
	const openSettings = useOpenSettings();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);
	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();
	const hasTasksAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.ELECTRIC_TASKS_ACCESS,
	);

	const {
		data: activeWorkspace,
		isLoading: isWorkspaceLoading,
		isError,
		failureCount,
		refetch,
	} = trpc.workspaces.getActive.useQuery(undefined, {
		enabled: isSignedIn,
	});
	const [isRetrying, setIsRetrying] = useState(false);
	const { splitPaneAuto, splitPaneVertical, splitPaneHorizontal } =
		useTabsWithPresets();
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const tabs = useTabsStore((s) => s.tabs);

	useAgentHookListener();
	useUpdateListener();
	useHotkeysSync();

	trpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				openSettings(event.data.section);
			}
		},
	});

	const activeWorkspaceId = activeWorkspace?.id;
	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;
	const focusedPaneId = activeTabId ? focusedPaneIds[activeTabId] : null;
	const activeTab = tabs.find((t) => t.id === activeTabId);
	const isWorkspaceView = currentView === "workspace";

	useAppHotkey("SHOW_HOTKEYS", () => openSettings("keyboard"), undefined, [
		openSettings,
	]);

	useAppHotkey(
		"TOGGLE_SIDEBAR",
		() => {
			if (isWorkspaceView) toggleSidebar();
		},
		undefined,
		[toggleSidebar, isWorkspaceView],
	);

	useAppHotkey(
		"TOGGLE_WORKSPACE_SIDEBAR",
		() => {
			if (!isWorkspaceSidebarOpen) {
				// If sidebar is closed, open it to collapsed state
				setWorkspaceSidebarOpen(true);
			} else {
				// If sidebar is open, toggle between collapsed and expanded
				toggleWorkspaceSidebarCollapsed();
			}
		},
		undefined,
		[
			isWorkspaceSidebarOpen,
			setWorkspaceSidebarOpen,
			toggleWorkspaceSidebarCollapsed,
		],
	);

	useAppHotkey("NEW_WORKSPACE", () => openNewWorkspaceModal(), undefined, [
		openNewWorkspaceModal,
	]);

	/**
	 * Resolves the target pane for split operations.
	 * If the focused pane is desynced from layout (e.g., was removed),
	 * falls back to first pane and corrects focus state.
	 */
	const resolveSplitTarget = useCallback(
		(paneId: string, tabId: string, targetTab: Tab) => {
			const path = findPanePath(targetTab.layout, paneId);
			if (path !== null) return { path, paneId };

			// Focused pane not in layout - correct focus and use first pane
			const firstPaneId = getFirstPaneId(targetTab.layout);
			const firstPanePath = findPanePath(targetTab.layout, firstPaneId);
			setFocusedPane(tabId, firstPaneId);
			return { path: firstPanePath ?? [], paneId: firstPaneId };
		},
		[setFocusedPane],
	);

	useAppHotkey(
		"SPLIT_AUTO",
		() => {
			if (isWorkspaceView && activeTabId && focusedPaneId && activeTab) {
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
		[
			activeTabId,
			focusedPaneId,
			activeTab,
			splitPaneAuto,
			resolveSplitTarget,
			isWorkspaceView,
		],
	);

	useAppHotkey(
		"SPLIT_RIGHT",
		() => {
			if (isWorkspaceView && activeTabId && focusedPaneId && activeTab) {
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
			isWorkspaceView,
		],
	);

	useAppHotkey(
		"SPLIT_DOWN",
		() => {
			if (isWorkspaceView && activeTabId && focusedPaneId && activeTab) {
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
			isWorkspaceView,
		],
	);

	const isLoading = isWorkspaceLoading;
	const showStartView =
		!isLoading && !activeWorkspace && currentView !== "settings";

	// Show loading while version check is in progress
	if (isVersionLoading) {
		return (
			<>
				<Background />
				<AppFrame>
					<div className="flex h-full w-full items-center justify-center bg-background">
						<LoadingSpinner />
					</div>
				</AppFrame>
			</>
		);
	}

	// Block app if version is outdated
	if (isVersionBlocked && versionRequirements) {
		return (
			<UpdateRequiredPage
				currentVersion={window.App.appVersion}
				minimumVersion={versionRequirements.minimumVersion}
				message={versionRequirements.message}
			/>
		);
	}

	// Show loading while auth state is being determined
	if (isAuthLoading) {
		return (
			<>
				<Background />
				<AppFrame>
					<div className="flex h-full w-full items-center justify-center bg-background">
						<LoadingSpinner />
					</div>
				</AppFrame>
			</>
		);
	}

	// Show sign-in screen if user is not signed in
	if (!isSignedIn) {
		return (
			<>
				<Background />
				<AppFrame>
					<SignInScreen />
				</AppFrame>
			</>
		);
	}

	const renderContent = () => {
		if (currentView === "settings") {
			return <SettingsView />;
		}
		if (currentView === "tasks" && hasTasksAccess) {
			return <TasksView />;
		}
		if (currentView === "workspaces-list") {
			return <WorkspacesListView />;
		}
		return <WorkspaceView />;
	};

	if (isLoading) {
		return (
			<DndProvider manager={dragDropManager}>
				<Background />
				<AppFrame>
					<div className="flex h-full w-full items-center justify-center bg-background">
						<LoadingSpinner />
					</div>
				</AppFrame>
			</DndProvider>
		);
	}

	if (isError) {
		const hasRepeatedFailures = failureCount >= 5;

		const handleRetry = async () => {
			setIsRetrying(true);
			await refetch();
			setIsRetrying(false);
		};

		return (
			<DndProvider manager={dragDropManager}>
				<Background />
				<AppFrame>
					<div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background">
						<div className="flex flex-col items-center gap-2 text-center">
							<p className="text-sm text-muted-foreground">
								Failed to load workspace
							</p>
							{hasRepeatedFailures && (
								<p className="text-xs text-muted-foreground/70 max-w-xs">
									This may indicate a connection issue. Try restarting the app
									if the problem persists.
								</p>
							)}
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleRetry}
							disabled={isRetrying}
							className="gap-2"
						>
							{isRetrying ? (
								<LoadingSpinner />
							) : (
								<HiArrowPath className="h-4 w-4" />
							)}
							{isRetrying ? "Retrying..." : "Retry"}
						</Button>
					</div>
				</AppFrame>
			</DndProvider>
		);
	}

	return (
		<DndProvider manager={dragDropManager}>
			<Background />
			<AppFrame>
				{showStartView ? (
					<StartView />
				) : (
					<div className="flex flex-col h-full w-full">
						<TopBar />
						<div className="flex flex-1 overflow-hidden">
							{isWorkspaceSidebarOpen && (
								<ResizablePanel
									width={workspaceSidebarWidth}
									onWidthChange={setWorkspaceSidebarWidth}
									isResizing={isWorkspaceSidebarResizing}
									onResizingChange={setWorkspaceSidebarIsResizing}
									minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
									maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
									handleSide="right"
									clampWidth={false}
								>
									<WorkspaceSidebar
										isCollapsed={isWorkspaceSidebarCollapsed()}
									/>
								</ResizablePanel>
							)}
							{renderContent()}
						</div>
					</div>
				)}
			</AppFrame>
			<SetupConfigModal />
			<NewWorkspaceModal />
			<WorkspaceInitEffects />
		</DndProvider>
	);
}
