import { HiOutlineWifi } from "react-icons/hi2";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { NavigationControls } from "./components/NavigationControls";
import { OpenInMenuButton } from "./components/OpenInMenuButton";
import { OrganizationDropdown } from "./components/OrganizationDropdown";
import { ResourceConsumption } from "./components/ResourceConsumption";
import { SearchBarTrigger } from "./components/SearchBarTrigger";
import { SidebarToggle } from "./components/SidebarToggle";
import { V2OpenInMenuButton } from "./components/V2OpenInMenuButton";
import { WindowControls } from "./components/WindowControls";
import { useCurrentWorkspaceForTopBar } from "./hooks/useCurrentWorkspaceForTopBar";

export function TopBar() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const currentWorkspace = useCurrentWorkspaceForTopBar();
	const isOnline = useOnlineStatus();
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

			{currentWorkspace.workspaceId && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<div className="pointer-events-auto">
						<SearchBarTrigger workspaceName={currentWorkspace.workspaceName} />
					</div>
				</div>
			)}

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{!isOnline && (
					<div className="no-drag flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
						<HiOutlineWifi className="size-3.5" />
						<span>Offline</span>
					</div>
				)}
				{currentWorkspace.openIn?.kind === "v1" ? (
					<OpenInMenuButton
						branch={currentWorkspace.openIn.branch}
						projectId={currentWorkspace.openIn.projectId}
						worktreePath={currentWorkspace.openIn.worktreePath}
					/>
				) : currentWorkspace.openIn?.kind === "v2" ? (
					<V2OpenInMenuButton
						branch={currentWorkspace.openIn.branch}
						hostUrl={currentWorkspace.openIn.hostUrl}
						projectId={currentWorkspace.openIn.projectId}
						workspaceId={currentWorkspace.openIn.workspaceId}
					/>
				) : null}
				<OrganizationDropdown />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
