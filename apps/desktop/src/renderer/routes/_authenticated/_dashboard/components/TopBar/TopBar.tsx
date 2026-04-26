import { useMatchRoute, useParams } from "@tanstack/react-router";
import { HiOutlineWifi } from "react-icons/hi2";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getWorkspaceDisplayName } from "renderer/lib/getWorkspaceDisplayName";
import { NavigationControls } from "./components/NavigationControls";
import { OpenInMenuButton } from "./components/OpenInMenuButton";
import { OrganizationDropdown } from "./components/OrganizationDropdown";
import { ResourceConsumption } from "./components/ResourceConsumption";
import { RightSidebarToggle } from "./components/RightSidebarToggle";
import { SearchBarTrigger } from "./components/SearchBarTrigger";
import { SidebarToggle } from "./components/SidebarToggle";
import { V2WorkspaceOpenInButton } from "./components/V2WorkspaceOpenInButton";
import { V2WorkspaceSearchBarTrigger } from "./components/V2WorkspaceSearchBarTrigger";
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
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-muted/45 border-b border-border relative dark:bg-muted/35">
			<div
				className="flex items-center gap-1.5 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			>
				<SidebarToggle />
				<NavigationControls />
				<ResourceConsumption />
			</div>

			{isV2WorkspaceRoute ? (
				<V2WorkspaceSearchBarTrigger workspaceId={v2WorkspaceId} />
			) : (
				workspaceId && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="pointer-events-auto">
							<SearchBarTrigger
								workspaceName={
									workspace
										? getWorkspaceDisplayName(
												workspace.name,
												workspace.type,
												workspace.project?.name,
											)
										: undefined
								}
							/>
						</div>
					</div>
				)
			)}

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
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
