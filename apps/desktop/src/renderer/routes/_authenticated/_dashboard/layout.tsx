import {
	CatchBoundary,
	createFileRoute,
	Outlet,
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CommandPaletteHost } from "renderer/commandPalette";
import { Redirect } from "renderer/components/Redirect";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useQuickCreateWorkspace } from "renderer/hooks/useQuickCreateWorkspace";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar";
import { DashboardSidebarPortsProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { useDevSeedV2Sidebar } from "renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { usePortsDisplayMode } from "renderer/stores/inline-workspace-ports";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { CrossVersionMismatchState } from "./components/CrossVersionMismatchState";
import { DashboardContentError } from "./components/DashboardContentError";
import { TopBar } from "./components/TopBar";

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
	const location = useLocation();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const portsDisplayMode = usePortsDisplayMode();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const quickCreateWorkspace = useQuickCreateWorkspace();
	useDevSeedV2Sidebar();
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
	const onNewWorkspaceRoute = matchRoute({ to: "/new-workspace" }) !== false;
	const onDashboardViewRoute =
		matchRoute({ to: "/automations", fuzzy: true }) !== false ||
		matchRoute({ to: "/tasks", fuzzy: true }) !== false ||
		matchRoute({ to: "/pull-requests", fuzzy: true }) !== false ||
		matchRoute({ to: "/plugins", fuzzy: true }) !== false ||
		matchRoute({ to: "/pages", fuzzy: true }) !== false ||
		matchRoute({ to: "/v2-workspaces", fuzzy: true }) !== false;
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
		openNewWorkspaceModal(
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

			if (
				currentV2WorkspaceId &&
				currentV2Workspace &&
				currentV2Workspace.type !== "main"
			) {
				useDeleteWorkspaceIntent.getState().request({
					workspaceId: currentV2WorkspaceId,
					workspaceName: currentV2Workspace.name || currentV2Workspace.branch,
				});
			}
		},
		{
			enabled:
				(!!currentWorkspaceId && !!currentWorkspace) ||
				(!!currentV2WorkspaceId &&
					!!currentV2Workspace &&
					currentV2Workspace.type !== "main"),
		},
	);

	// Collapsed rail on the v2 workspace route: the rail's headroom strip
	// continues the pane tab bar, so the panel must not draw its own
	// full-height border — the sidebar's inner border (which stops below the
	// strip) is the only divider.
	const railContinuesTabBar =
		isV2CloudEnabled &&
		onV2WorkspaceRoute &&
		!versionMismatch &&
		isWorkspaceSidebarOpen &&
		isWorkspaceSidebarCollapsed();

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

	// Only lift the sidebar out of the TopBar column when v2 + expanded.
	// Collapsed/closed sidebars stay inside so the TopBar runs full-width.
	const sidebarOutsideColumn =
		isV2CloudEnabled &&
		isWorkspaceSidebarOpen &&
		!isWorkspaceSidebarCollapsed();

	// On the v2 workspace route with an open sidebar the TopBar row is merged
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
		(onV2WorkspaceRoute &&
			!versionMismatch &&
			isV2CloudEnabled &&
			isWorkspaceSidebarOpen) ||
		((onNewWorkspaceRoute || onDashboardViewRoute) && sidebarOutsideColumn);

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
					(isWorkspaceSidebarOpen && !isWorkspaceSidebarCollapsed()))
			}
		>
			<div className="flex h-full w-full overflow-hidden">
				<CommandPaletteHost />
				{sidebarOutsideColumn && sidebarPanel}
				<div className="flex flex-1 flex-col min-w-0 min-h-0">
					{!hideTopBar && <TopBar />}
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
								// Contain content-route crashes to this pane: without a
								// boundary they bubble to the root and unmount the whole
								// app, which reads as Superset restarting itself
								// (SUPER-1814). Resets on navigation.
								<CatchBoundary
									// Full href, not just pathname: a same-path search/hash
									// change (filter, tab) must also clear a stuck error pane.
									getResetKey={() => location.href}
									errorComponent={DashboardContentError}
								>
									<Outlet />
								</CatchBoundary>
							)}
						</div>
					</div>
				</div>
				<div
					id="workspace-right-sidebar-slot"
					className="flex h-full shrink-0"
				/>
				<AddRepositoryModals />
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
		</DashboardSidebarPortsProvider>
	);
}
