import {
	createFileRoute,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CommandPaletteHost } from "renderer/commandPalette";
import { Redirect } from "renderer/components/Redirect";
import { useWorkspaceNamingFailedToast } from "renderer/hooks/host-service/useWorkspaceNamingFailedToast";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useQuickCreateWorkspace } from "renderer/hooks/useQuickCreateWorkspace";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar";
import { DashboardSidebarPortsProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { PortForwardsProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { useHistoryNavigationShortcuts } from "renderer/routes/_authenticated/_dashboard/hooks/useHistoryNavigationShortcuts";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useDevSeedV2Sidebar } from "renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useAutomationFailuresStore } from "renderer/stores/automation-failures";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { usePortsDisplayMode } from "renderer/stores/inline-workspace-ports";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { syncPersistedStoreAcrossWindows } from "renderer/stores/syncPersistedStoreAcrossWindows";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { ContentBoundary } from "../components/ContentBoundary";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { CrossVersionMismatchState } from "./components/CrossVersionMismatchState";
import { RemotePortForwarder } from "./components/RemotePortForwarder";
import { SaveAsEnvironmentMount } from "./components/SaveAsEnvironmentMount";
import { TopBar } from "./components/TopBar";
import { useShowsAppTopBar } from "./hooks/useShowsAppTopBar";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

/** v1 only — v2 deletes go through the globally-mounted DeleteWorkspaceMount
 * (see delete-workspace-intent store). */
type DeleteTarget = {
	workspaceId: string;
	workspaceName: string;
	workspaceType: "worktree" | "branch";
};

function DashboardLayout() {
	const navigate = useNavigate();

	const openNewWorkspace = useOpenNewWorkspace();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const portsDisplayMode = usePortsDisplayMode();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const quickCreateWorkspace = useQuickCreateWorkspace();
	useDevSeedV2Sidebar();
	useEffect(() => {
		const stopWorkspaceSidebarSync = syncPersistedStoreAcrossWindows(
			useWorkspaceSidebarStore,
		);
		const stopSectionCollapseSync = syncPersistedStoreAcrossWindows(
			useSidebarSectionsCollapseStore,
		);
		const stopAgentStateSync = syncPersistedStoreAcrossWindows(
			useV2NotificationStore,
		);
		const stopCloudSidebarSync =
			syncPersistedStoreAcrossWindows(useCloudSidebarStore);
		const stopAutomationFailuresSync = syncPersistedStoreAcrossWindows(
			useAutomationFailuresStore,
		);

		return () => {
			stopWorkspaceSidebarSync();
			stopSectionCollapseSync();
			stopAgentStateSync();
			stopCloudSidebarSync();
			stopAutomationFailuresSync();
		};
	}, []);
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;
	const v2WorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const currentV2WorkspaceId =
		v2WorkspaceMatch !== false ? v2WorkspaceMatch.workspaceId : null;
	const onV1WorkspaceRoute = currentWorkspaceMatch !== false;
	const onV2WorkspaceRoute = v2WorkspaceMatch !== false;
	useHistoryNavigationShortcuts();
	const showsAppTopBar = useShowsAppTopBar();
	const versionMismatch =
		(isV2CloudEnabled && onV1WorkspaceRoute) ||
		(!isV2CloudEnabled && onV2WorkspaceRoute);

	const { data: currentWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	const currentV2Workspace = useMemo(
		() =>
			currentV2WorkspaceId != null
				? (hostWorkspaces.find(
						(workspace) => workspace.id === currentV2WorkspaceId,
					) ?? null)
				: null,
		[hostWorkspaces, currentV2WorkspaceId],
	);
	const { machineId: localMachineId } = useLocalHostService();
	useWorkspaceNamingFailedToast();
	// Forwarding needs port data only for a workspace on another machine;
	// a local selection must not switch on cross-host port polling.
	// machineId is "" until the device query answers; treat unknown as local
	// rather than switching on cross-host polling for a workspace that may
	// not be remote at all.
	const selectedWorkspaceIsRemote =
		currentV2Workspace != null &&
		localMachineId !== "" &&
		currentV2Workspace.hostId !== localMachineId;

	const {
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	// Global hotkeys for dashboard
	useHotkey("OPEN_SETTINGS", () => navigate({ to: "/settings/account" }));
	useHotkey("SHOW_HOTKEYS", () => navigate({ to: "/settings/keyboard" }), {
		ignoreEventWhen: (e) => e.defaultPrevented,
	});
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", toggleWorkspaceSidebarCollapsed);
	useHotkey("NEW_WORKSPACE", () =>
		openNewWorkspace(
			currentWorkspace?.projectId ?? currentV2Workspace?.projectId ?? undefined,
		),
	);
	useHotkey(
		"QUICK_CREATE_WORKSPACE",
		() => quickCreateWorkspace(currentV2Workspace?.projectId ?? null),
		{ enabled: isV2CloudEnabled },
	);

	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

	useHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (currentWorkspaceId && currentWorkspace) {
				setDeleteTarget({
					workspaceId: currentWorkspaceId,
					workspaceName: currentWorkspace.name,
					workspaceType: currentWorkspace.type,
				});
				return;
			}

			if (currentV2WorkspaceId && currentV2Workspace) {
				useDeleteWorkspaceIntent.getState().request({
					workspaceId: currentV2WorkspaceId,
					workspaceName: currentV2Workspace.name || currentV2Workspace.branch,
				});
			}
		},
		{
			enabled:
				(!!currentWorkspaceId && !!currentWorkspace) ||
				(!!currentV2WorkspaceId && !!currentV2Workspace),
		},
	);

	// The collapsed rail's top strip continues the page's header row, so the
	// panel must not draw its own full-height border: the sidebar's inner
	// border, which stops below the strip, is the only divider.
	const railContinuesHeaderRow =
		!showsAppTopBar && isWorkspaceSidebarCollapsed();

	const sidebarPanel = (
		<ResizablePanel
			width={workspaceSidebarWidth}
			onWidthChange={setWorkspaceSidebarWidth}
			isResizing={isWorkspaceSidebarResizing}
			onResizingChange={setWorkspaceSidebarIsResizing}
			minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
			maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
			handleSide="right"
			clampWidth={false}
			className={railContinuesHeaderRow ? "border-r-0" : undefined}
			onDoubleClickHandle={() =>
				setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
			}
		>
			{isV2CloudEnabled ? (
				<DashboardSidebar isCollapsed={isWorkspaceSidebarCollapsed()} />
			) : (
				<WorkspaceSidebar
					isCollapsed={isWorkspaceSidebarCollapsed()}
					activeProjectId={currentWorkspace?.projectId ?? null}
					activeProjectName={currentWorkspace?.project?.name ?? null}
				/>
			)}
		</ResizablePanel>
	);

	// v2 screens draw their own headers, so the sidebar always runs full
	// height beside them; only v1 screens keep the TopBar above both.
	const sidebarOutsideColumn =
		!showsAppTopBar || (isV2CloudEnabled && !isWorkspaceSidebarCollapsed());

	return (
		// The single ports-data provider for both layout modes. It lives up here
		// (not in the sidebar) because in topbar mode the pill renders inside
		// subtrees that remount on workspace navigation (TopBar / the workspace
		// tab bar) — the data must survive those remounts or the pill blinks out
		// for the first empty-data frames. The inline chip in the sidebar reads
		// the same context; polling stays off when nothing renders ports (v1, or
		// a collapsed/closed sidebar in inline mode).
		<DashboardSidebarPortsProvider
			enabled={
				isV2CloudEnabled &&
				(portsDisplayMode === "topbar" ||
					!isWorkspaceSidebarCollapsed() ||
					// Port forwarding follows the selected remote workspace and
					// needs its port list even when no ports UI is on screen.
					selectedWorkspaceIsRemote)
			}
		>
			<PortForwardsProvider>
				<RemotePortForwarder />
				<div className="flex h-full w-full overflow-hidden">
					<CommandPaletteHost />
					{sidebarOutsideColumn && sidebarPanel}
					<div className="flex flex-1 flex-col min-w-0 min-h-0">
						{showsAppTopBar && <TopBar />}
						<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
							{!sidebarOutsideColumn && sidebarPanel}
							<div className="relative flex flex-1 min-h-0 min-w-0">
								{versionMismatch ? (
									// A v2 user on a stale v1 workspace route has nothing to go
									// back to, so send them somewhere actionable instead of a
									// dead-end "pick a workspace" screen. v1 users keep the
									// static state — /new-workspace is a v2-only surface.
									isV2CloudEnabled ? (
										<Redirect to="/new-workspace" replace />
									) : (
										<CrossVersionMismatchState />
									)
								) : (
									<ContentBoundary>
										<Outlet />
									</ContentBoundary>
								)}
							</div>
						</div>
					</div>
					<div
						id="workspace-right-sidebar-slot"
						className="flex h-full shrink-0"
					/>
					<AddRepositoryModals />
					<SaveAsEnvironmentMount />
					{deleteTarget && (
						<DeleteWorkspaceDialog
							workspaceId={deleteTarget.workspaceId}
							workspaceName={deleteTarget.workspaceName}
							workspaceType={deleteTarget.workspaceType}
							open={true}
							onOpenChange={(open) => {
								if (!open) setDeleteTarget(null);
							}}
						/>
					)}
				</div>
			</PortForwardsProvider>
		</DashboardSidebarPortsProvider>
	);
}
