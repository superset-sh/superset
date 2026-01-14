import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { trpcClient } from "renderer/lib/trpc-client";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { NotFound } from "renderer/routes/not-found";
import { ContentView } from "renderer/screens/main/components/WorkspaceView/ContentView";
import { WorkspaceInitializingView } from "renderer/screens/main/components/WorkspaceView/WorkspaceInitializingView";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { getPaneDimensions } from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	findPanePath,
	getFirstPaneId,
	getNextPaneId,
	getPreviousPaneId,
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
	const { data: workspace } = trpc.workspaces.get.useQuery({ id: workspaceId });
	const navigate = useNavigate();

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
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const { addTab, splitPaneAuto, splitPaneVertical, splitPaneHorizontal } =
		useTabsWithPresets();
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const removePane = useTabsStore((s) => s.removePane);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);

	const tabs = useMemo(
		() => allTabs.filter((tab) => tab.workspaceId === workspaceId),
		[workspaceId, allTabs],
	);

	const activeTabId = activeTabIds[workspaceId] ?? null;

	const activeTab = useMemo(
		() => (activeTabId ? tabs.find((t) => t.id === activeTabId) : null),
		[activeTabId, tabs],
	);

	const focusedPaneId = activeTabId ? focusedPaneIds[activeTabId] : null;

	// Tab management shortcuts
	useAppHotkey(
		"NEW_GROUP",
		() => {
			addTab(workspaceId);
		},
		undefined,
		[workspaceId, addTab],
	);

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

	// Switch between tabs
	useAppHotkey(
		"PREV_TERMINAL",
		() => {
			if (!activeTabId) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			if (index > 0) {
				setActiveTab(workspaceId, tabs[index - 1].id);
			}
		},
		undefined,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"NEXT_TERMINAL",
		() => {
			if (!activeTabId) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			if (index < tabs.length - 1) {
				setActiveTab(workspaceId, tabs[index + 1].id);
			}
		},
		undefined,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	// Switch between panes within a tab
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
			if (workspace?.worktreePath) {
				openInApp.mutate({
					path: workspace.worktreePath,
					app: lastUsedApp,
				});
			}
		},
		undefined,
		[workspace?.worktreePath, lastUsedApp],
	);

	// Copy path shortcut
	const copyPath = trpc.external.copyPath.useMutation();
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

	// Toggle changes sidebar (⌘L)
	useAppHotkey("TOGGLE_SIDEBAR", () => toggleSidebar(), undefined, [
		toggleSidebar,
	]);

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
	const getPreviousWorkspace = trpc.workspaces.getPreviousWorkspace.useQuery(
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
	const getNextWorkspace = trpc.workspaces.getNextWorkspace.useQuery(
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
			<div className="flex-1 min-h-0 overflow-hidden">
				{showInitView ? (
					<WorkspaceInitializingView
						workspaceId={workspaceId}
						workspaceName={workspace?.name ?? "Workspace"}
						isInterrupted={hasIncompleteInit && !isInitializing}
					/>
				) : (
					<ContentView />
				)}
			</div>
		</div>
	);
}
