import { useParams } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { NavigationControls } from "./components/NavigationControls";
import { OpenInMenuButton } from "./components/OpenInMenuButton";
import { OrganizationDropdown } from "./components/OrganizationDropdown";
import { SidebarToggle } from "./components/SidebarToggle";
import { WindowControls } from "./components/WindowControls";

export function TopBar() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background border-b border-border relative">
			<div
				className="flex items-center gap-1.5 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			>
				<SidebarToggle />
				<NavigationControls />
			</div>

			{workspace?.project?.name && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<span className="text-sm text-muted-foreground font-medium truncate max-w-[200px]">
						{workspace.project.name}
					</span>
				</div>
			)}

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{workspace?.worktreePath && (
					<OpenInMenuButton
						worktreePath={workspace.worktreePath}
						branch={workspace.worktree?.branch}
					/>
				)}
				<OrganizationDropdown />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
