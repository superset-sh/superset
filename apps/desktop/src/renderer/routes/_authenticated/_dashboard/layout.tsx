import {
	createFileRoute,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { CommandPaletteHost } from "renderer/commandPalette";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useQuickCreateWorkspace } from "renderer/hooks/useQuickCreateWorkspace";
import { useHotkey } from "renderer/hotkeys";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar";
import { DashboardSidebarPortsProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { PortForwardsProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { useDevSeedSidebar } from "renderer/routes/_authenticated/hooks/useDevSeedSidebar";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { usePortsDisplayMode } from "renderer/stores/inline-workspace-ports";
import { useNotificationStore } from "renderer/stores/notifications";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { syncPersistedStoreAcrossWindows } from "renderer/stores/syncPersistedStoreAcrossWindows";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { ContentBoundary } from "../components/ContentBoundary";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { RemotePortForwarder } from "./components/RemotePortForwarder";
import { TopBar } from "./components/TopBar";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

function DashboardLayout() {
	const navigate = useNavigate();

	const openNewWorkspace = useOpenNewWorkspace();
	const portsDisplayMode = usePortsDisplayMode();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const quickCreateWorkspace = useQuickCreateWorkspace();
	useDevSeedSidebar();
	useEffect(() => {
		const stopWorkspaceSidebarSync = syncPersistedStoreAcrossWindows(
			useWorkspaceSidebarStore,
		);
		const stopSectionCollapseSync = syncPersistedStoreAcrossWindows(
			useSidebarSectionsCollapseStore,
		);
		const stopAgentStateSync =
			syncPersistedStoreAcrossWindows(useNotificationStore);

		return () => {
			stopWorkspaceSidebarSync();
			stopSectionCollapseSync();
			stopAgentStateSync();
		};
	}, []);
	const matchRoute = useMatchRoute();
	const workspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	const onWorkspaceRoute = workspaceMatch !== false;
	const onNewWorkspaceRoute = matchRoute({ to: "/new-workspace" }) !== false;
	const onDashboardViewRoute =
		matchRoute({ to: "/automations", fuzzy: true }) !== false ||
		matchRoute({ to: "/tasks", fuzzy: true }) !== false ||
		matchRoute({ to: "/pull-requests", fuzzy: true }) !== false ||
		matchRoute({ to: "/plugins", fuzzy: true }) !== false ||
		matchRoute({ to: "/pages", fuzzy: true }) !== false ||
		matchRoute({ to: "/workspaces", fuzzy: true }) !== false;

	const currentWorkspace = useMemo(
		() =>
			currentWorkspaceId != null
				? (hostWorkspaces.find(
						(workspace) => workspace.id === currentWorkspaceId,
					) ?? null)
				: null,
		[hostWorkspaces, currentWorkspaceId],
	);
	const { machineId: localMachineId } = useLocalHostService();
	// Forwarding needs port data only for a workspace on another machine;
	// a local selection must not switch on cross-host port polling.
	// machineId is "" until the device query answers; treat unknown as local
	// rather than switching on cross-host polling for a workspace that may
	// not be remote at all.
	const selectedWorkspaceIsRemote =
		currentWorkspace != null &&
		localMachineId !== "" &&
		currentWorkspace.hostId !== localMachineId;

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

	// Global hotkeys for dashboard
	useHotkey("OPEN_SETTINGS", () => navigate({ to: "/settings/account" }));
	useHotkey("SHOW_HOTKEYS", () => navigate({ to: "/settings/keyboard" }));
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", () => {
		if (!isWorkspaceSidebarOpen) {
			setWorkspaceSidebarOpen(true);
		} else {
			toggleWorkspaceSidebarCollapsed();
		}
	});
	useHotkey("NEW_WORKSPACE", () =>
		openNewWorkspace(currentWorkspace?.projectId ?? undefined),
	);
	useHotkey("QUICK_CREATE_WORKSPACE", () =>
		quickCreateWorkspace(currentWorkspace?.projectId ?? null),
	);

	useHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (currentWorkspaceId && currentWorkspace) {
				useDeleteWorkspaceIntent.getState().request({
					workspaceId: currentWorkspaceId,
					workspaceName: currentWorkspace.name || currentWorkspace.branch,
				});
			}
		},
		{ enabled: !!currentWorkspaceId && !!currentWorkspace },
	);

	// Collapsed rail on the workspace route: the rail's headroom strip
	// continues the pane tab bar, so the panel must not draw its own
	// full-height border — the sidebar's inner border (which stops below the
	// strip) is the only divider.
	const railContinuesTabBar =
		onWorkspaceRoute && isWorkspaceSidebarOpen && isWorkspaceSidebarCollapsed();

	const sidebarPanel = isWorkspaceSidebarOpen && (
		<ResizablePanel
			width={workspaceSidebarWidth}
			onWidthChange={setWorkspaceSidebarWidth}
			isResizing={isWorkspaceSidebarResizing}
			onResizingChange={setWorkspaceSidebarIsResizing}
			minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
			maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
			handleSide="right"
			clampWidth={false}
			className={railContinuesTabBar ? "border-r-0" : undefined}
			onDoubleClickHandle={() =>
				setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
			}
		>
			<DashboardSidebar isCollapsed={isWorkspaceSidebarCollapsed()} />
		</ResizablePanel>
	);

	// Only lift the sidebar out of the TopBar column when expanded.
	// Collapsed/closed sidebars stay inside so the TopBar runs full-width.
	const sidebarOutsideColumn =
		isWorkspaceSidebarOpen && !isWorkspaceSidebarCollapsed();

	// On the workspace route with an open sidebar the TopBar row is merged
	// into the pane tab bar (which provides the drag region and hosts the
	// right-sidebar toggle). Expanded sidebars host the traffic-light pad in
	// their header; collapsed rails host it via their headroom spacer plus the
	// tab bar's leading inset. Only a fully closed sidebar keeps the TopBar,
	// whose inset then keeps content clear of the macOS traffic lights. The
	// new-workspace page brings its own drag strip, and the dashboard views
	// (automations/tasks/workspaces) carry drag fillers in their own headers,
	// so they hide the TopBar whenever the expanded sidebar sits outside the
	// column — otherwise it renders as an empty strip above their headers.
	const hideTopBar =
		(onWorkspaceRoute && isWorkspaceSidebarOpen) ||
		((onNewWorkspaceRoute || onDashboardViewRoute) && sidebarOutsideColumn);

	return (
		// The single ports-data provider for both layout modes. It lives up here
		// (not in the sidebar) because in topbar mode the pill renders inside
		// subtrees that remount on workspace navigation (TopBar / the workspace
		// tab bar) — the data must survive those remounts or the pill blinks out
		// for the first empty-data frames. The inline chip in the sidebar reads
		// the same context; polling stays off when nothing renders ports (a
		// collapsed/closed sidebar in inline mode).
		<DashboardSidebarPortsProvider
			enabled={
				portsDisplayMode === "topbar" ||
				(isWorkspaceSidebarOpen && !isWorkspaceSidebarCollapsed()) ||
				// Port forwarding follows the selected remote workspace and
				// needs its port list even when no ports UI is on screen.
				selectedWorkspaceIsRemote
			}
		>
			<PortForwardsProvider>
				<RemotePortForwarder />
				<div className="flex h-full w-full overflow-hidden">
					<CommandPaletteHost />
					{sidebarOutsideColumn && sidebarPanel}
					<div className="flex flex-1 flex-col min-w-0 min-h-0">
						{!hideTopBar && <TopBar />}
						<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
							{!sidebarOutsideColumn && sidebarPanel}
							<div className="relative flex flex-1 min-h-0 min-w-0">
								<ContentBoundary>
									<Outlet />
								</ContentBoundary>
							</div>
						</div>
					</div>
					<div
						id="workspace-right-sidebar-slot"
						className="flex h-full shrink-0"
					/>
					<AddRepositoryModals />
				</div>
			</PortForwardsProvider>
		</DashboardSidebarPortsProvider>
	);
}
