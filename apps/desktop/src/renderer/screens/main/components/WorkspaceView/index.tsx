import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";
import { getNextPaneId, getPreviousPaneId } from "renderer/stores/tabs/utils";
import {
	useHasWorkspaceFailed,
	useIsWorkspaceInitializing,
} from "renderer/stores/workspace-init";
import { useWorkspaceViewModeStore } from "renderer/stores/workspace-view-mode";
import { ContentView } from "./ContentView";
import { ResizableSidebar } from "./ResizableSidebar";
import { WorkspaceInitializingView } from "./WorkspaceInitializingView";

export function WorkspaceView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;

	// Check if active workspace is initializing or failed
	const isInitializing = useIsWorkspaceInitializing(activeWorkspaceId ?? "");
	const hasFailed = useHasWorkspaceFailed(activeWorkspaceId ?? "");

	// Also check for incomplete init after app restart:
	// - worktree type workspace with null/undefined gitStatus means init never completed
	// - This handles the case where app restarts during init (in-memory progress lost)
	// - Uses explicit check instead of == null to avoid lint issues
	const gitStatus = activeWorkspace?.worktree?.gitStatus;
	const hasIncompleteInit =
		activeWorkspace?.type === "worktree" &&
		(gitStatus === null || gitStatus === undefined);

	const showInitView =
		activeWorkspaceId && (isInitializing || hasFailed || hasIncompleteInit);

	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const addTab = useTabsStore((s) => s.addTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const removePane = useTabsStore((s) => s.removePane);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	// Get the active tab object for layout access
	const activeTab = useMemo(
		() => (activeTabId ? tabs.find((t) => t.id === activeTabId) : null),
		[activeTabId, tabs],
	);

	// Get focused pane ID for the active tab
	const focusedPaneId = activeTabId ? focusedPaneIds[activeTabId] : null;

	// View mode for terminal creation - subscribe to actual data for reactivity
	const viewModeByWorkspaceId = useWorkspaceViewModeStore(
		(s) => s.viewModeByWorkspaceId,
	);
	const setWorkspaceViewMode = useWorkspaceViewModeStore(
		(s) => s.setWorkspaceViewMode,
	);
	const viewMode = activeWorkspaceId
		? (viewModeByWorkspaceId[activeWorkspaceId] ?? "workbench")
		: "workbench";

	// Tab management shortcuts
	useAppHotkey(
		"NEW_GROUP",
		() => {
			if (activeWorkspaceId) {
				// If in Review mode, switch to Workbench first
				if (viewMode === "review") {
					setWorkspaceViewMode(activeWorkspaceId, "workbench");
				}
				addTab(activeWorkspaceId);
			}
		},
		undefined,
		[activeWorkspaceId, addTab, viewMode, setWorkspaceViewMode],
	);

	useAppHotkey(
		"CLOSE_TERMINAL",
		() => {
			// Close focused pane (which may close the tab if it's the last pane)
			if (focusedPaneId) {
				removePane(focusedPaneId);
			}
		},
		undefined,
		[focusedPaneId, removePane],
	);

	// Switch between tabs (⌘+Up/Down)
	useAppHotkey(
		"PREV_TERMINAL",
		() => {
			if (!activeWorkspaceId || !activeTabId) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			if (index > 0) {
				setActiveTab(activeWorkspaceId, tabs[index - 1].id);
			}
		},
		undefined,
		[activeWorkspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"NEXT_TERMINAL",
		() => {
			if (!activeWorkspaceId || !activeTabId) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			if (index < tabs.length - 1) {
				setActiveTab(activeWorkspaceId, tabs[index + 1].id);
			}
		},
		undefined,
		[activeWorkspaceId, activeTabId, tabs, setActiveTab],
	);

	// Switch between panes within a tab (⌘+⌥+Left/Right)
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
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation();
	useAppHotkey(
		"OPEN_IN_APP",
		() => {
			if (activeWorkspace?.worktreePath) {
				openInApp.mutate({
					path: activeWorkspace.worktreePath,
					app: lastUsedApp,
				});
			}
		},
		undefined,
		[activeWorkspace?.worktreePath, lastUsedApp],
	);

	// Copy path shortcut
	const copyPath = trpc.external.copyPath.useMutation();
	useAppHotkey(
		"COPY_PATH",
		() => {
			if (activeWorkspace?.worktreePath) {
				copyPath.mutate(activeWorkspace.worktreePath);
			}
		},
		undefined,
		[activeWorkspace?.worktreePath],
	);

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden">
			<div className="flex-1 flex bg-tertiary overflow-hidden">
				<ResizableSidebar />
				<div className="flex-1 min-w-0 h-full bg-background flex flex-col overflow-hidden">
					<div className="flex-1 min-h-0 overflow-hidden">
						{showInitView && activeWorkspaceId ? (
							<WorkspaceInitializingView
								workspaceId={activeWorkspaceId}
								workspaceName={activeWorkspace?.name ?? "Workspace"}
								isInterrupted={hasIncompleteInit && !isInitializing}
							/>
						) : (
							<ContentView />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
