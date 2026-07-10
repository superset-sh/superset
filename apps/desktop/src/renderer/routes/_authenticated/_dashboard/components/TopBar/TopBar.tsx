import { useMatchRoute, useParams } from "@tanstack/react-router";
import { HiOutlineWifi } from "react-icons/hi2";
import { ZoomStable } from "renderer/components/ZoomStable";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { NavigationControls } from "../NavigationControls";
import { SidebarToggle } from "../SidebarToggle";
import { OpenInMenuButton } from "./components/OpenInMenuButton";
import { OrganizationDropdown } from "./components/OrganizationDropdown";
import { ResourceConsumption } from "./components/ResourceConsumption";
import { RightSidebarToggle } from "./components/RightSidebarToggle";
import { V2WorkspaceOpenInButton } from "./components/V2WorkspaceOpenInButton";
import { V2WorkspaceTitle } from "./components/V2WorkspaceTitle";
import { WindowControls } from "./components/WindowControls";

export function TopBar() {
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { workspaceId } = useParams({ strict: false });
	const v2Match = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const v2WorkspaceId = v2Match !== false ? v2Match.workspaceId : null;
	const isV2WorkspaceRoute = v2WorkspaceId !== null;
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId && !isV2WorkspaceRoute },
	);
	const isOnline = useOnlineStatus();
	const zoomFactor = useZoomFactor();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const isSidebarOpen = useWorkspaceSidebarStore((s) => s.isOpen);
	const isSidebarCollapsed = useWorkspaceSidebarStore((s) => s.isCollapsed());
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";
	// In v2 the expanded sidebar lives outside the TopBar column, so the TopBar
	// starts to the right of it and the sidebar header hosts the traffic-light
	// pad + SidebarToggle. When the sidebar is closed or collapsed (too narrow
	// for the pad), bring the toggle and pad back into the TopBar.
	const sidebarHostsChrome =
		isV2CloudEnabled && isSidebarOpen && !isSidebarCollapsed;

	// Counter-scale the inset and bar height so both stay a constant physical
	// size under page zoom, keeping the fixed macOS traffic lights aligned.
	const trafficLightInset =
		isMac && !sidebarHostsChrome ? `${80 / zoomFactor}px` : "16px";
	const barStyle = isMac ? { height: `${48 / zoomFactor}px` } : undefined;

	return (
		<div
			className="drag gap-2 h-12 w-full flex items-center justify-between bg-muted/45 border-b border-border relative dark:bg-muted/35"
			style={barStyle}
		>
			<div
				className="flex items-center h-full"
				style={{ paddingLeft: trafficLightInset }}
			>
				{!sidebarHostsChrome && (
					<ZoomStable enabled={isMac} className="flex items-center gap-1.5">
						<SidebarToggle />
						<NavigationControls />
						{!isV2CloudEnabled && <ResourceConsumption surface="v1" />}
					</ZoomStable>
				)}
			</div>

			<div className="flex min-w-0 flex-1 items-center justify-start">
				{isV2WorkspaceRoute && v2WorkspaceId && (
					<V2WorkspaceTitle workspaceId={v2WorkspaceId} />
				)}
			</div>

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{!sidebarHostsChrome && isV2CloudEnabled && (
					<ResourceConsumption surface="v2" />
				)}
				{!isOnline && (
					<div className="no-drag flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
						<HiOutlineWifi className="size-3.5" />
						<span>Offline</span>
					</div>
				)}
				{isV2WorkspaceRoute ? (
					<V2WorkspaceOpenInButton workspaceId={v2WorkspaceId} />
				) : workspace?.worktreePath ? (
					<OpenInMenuButton
						worktreePath={workspace.worktreePath}
						branch={workspace.worktree?.branch}
						projectId={workspace.project?.id}
					/>
				) : null}
				{!isV2CloudEnabled && <OrganizationDropdown />}
				{isV2WorkspaceRoute && <RightSidebarToggle />}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
