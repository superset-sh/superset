import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useMatchRoute } from "@tanstack/react-router";
import { HiOutlineWifi } from "react-icons/hi2";
import { ZoomStable } from "renderer/components/ZoomStable";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { AppMenuButton } from "../AppMenuButton";
import { NavigationControls } from "../NavigationControls";
import { SidebarToggle } from "../SidebarToggle";
import { WindowControlsInset } from "../WindowControlsInset";
import { RightSidebarToggle } from "./components/RightSidebarToggle";
import { TopBarPortsDropdown } from "./components/TopBarPortsDropdown";
import { WorkspaceTitle } from "./components/WorkspaceTitle";

export function TopBar() {
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const workspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const routeWorkspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	const isWorkspaceRoute = routeWorkspaceId !== null;
	const isOnline = useOnlineStatus();
	const zoomFactor = useZoomFactor();
	const isSidebarOpen = useWorkspaceSidebarStore((s) => s.isOpen);
	const isSidebarCollapsed = useWorkspaceSidebarStore((s) => s.isCollapsed());
	const isPullRequestsRoute =
		matchRoute({ to: "/pull-requests", fuzzy: true }) !== false;
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";
	// The expanded sidebar lives outside the TopBar column, so the TopBar
	// starts to the right of it and the sidebar header hosts the traffic-light
	// pad + SidebarToggle. When the sidebar is closed or collapsed (too narrow
	// for the pad), bring the toggle and pad back into the TopBar.
	const sidebarHostsChrome = isSidebarOpen && !isSidebarCollapsed;

	// Counter-scale the inset and bar height so both stay a constant physical
	// size under page zoom, keeping the fixed macOS traffic lights aligned.
	const trafficLightInset =
		isMac && !sidebarHostsChrome ? `${80 / zoomFactor}px` : "16px";
	const barStyle = isMac ? { height: `${48 / zoomFactor}px` } : undefined;

	return (
		<div
			// Window-drag regions live on the empty leaf elements (traffic-light
			// spacer + title filler), never on this container: `no-drag` carve-outs
			// under a `drag` ancestor are lost inside zoomed/masked/scrollable
			// wrappers, which makes the whole bar swallow clicks.
			className={cn(
				"gap-2 h-12 w-full flex items-center justify-between relative dark:bg-muted/35",
				isPullRequestsRoute && isSidebarCollapsed
					? "bg-sidebar"
					: "bg-muted/45",
			)}
			style={barStyle}
		>
			<div className="flex items-center h-full">
				<div
					className="drag h-full shrink-0"
					style={{ width: trafficLightInset }}
				/>
				{!sidebarHostsChrome && (
					<ZoomStable enabled={isMac} className="flex items-center gap-1.5">
						{!isMac && <AppMenuButton />}
						<SidebarToggle />
						<NavigationControls />
					</ZoomStable>
				)}
			</div>

			<div className="drag flex h-full min-w-0 flex-1 items-center justify-start">
				{isWorkspaceRoute && routeWorkspaceId && (
					<WorkspaceTitle workspaceId={routeWorkspaceId} />
				)}
			</div>

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{/* When the expanded sidebar hosts the chrome, its header also hosts
				    the ports pill — don't render a duplicate here. */}
				{!sidebarHostsChrome && <TopBarPortsDropdown />}
				{!isOnline && (
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
						<HiOutlineWifi className="size-3.5" />
						<span>
							<Trans>Offline</Trans>
						</span>
					</div>
				)}
				{isWorkspaceRoute && <RightSidebarToggle />}
				{!isMac && <WindowControlsInset />}
			</div>
		</div>
	);
}
