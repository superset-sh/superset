import type { NavigationStyle } from "@superset/local-db";
import { trpc } from "renderer/lib/trpc";
import { AvatarDropdown } from "../AvatarDropdown";
import { SidebarControl } from "./SidebarControl";
import { WindowControls } from "./WindowControls";
import { WorkspaceSidebarControl } from "./WorkspaceSidebarControl";
import { WorkspacesTabs } from "./WorkspaceTabs";

interface TopBarProps {
	navigationStyle?: NavigationStyle;
}

export function TopBar({ navigationStyle = "top-bar" }: TopBarProps) {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const isMac = platform === "darwin";
	const isSidebarMode = navigationStyle === "sidebar";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background border-b border-border">
			<div
				className="flex items-center gap-2 h-full"
				style={{
					paddingLeft: isMac ? "80px" : "16px",
				}}
			>
				{isSidebarMode && <WorkspaceSidebarControl />}
				<SidebarControl />
			</div>

			{isSidebarMode ? (
				<div className="flex items-center gap-2 flex-1 overflow-hidden h-full px-4">
					{activeWorkspace && (
						<span className="text-sm font-medium truncate">
							{activeWorkspace.project?.name ?? "Workspace"}
							<span className="text-muted-foreground mx-2">/</span>
							{activeWorkspace.name}
						</span>
					)}
				</div>
			) : (
				<div className="flex items-center gap-2 flex-1 overflow-hidden h-full">
					<WorkspacesTabs />
				</div>
			)}

			<div className="flex items-center h-full pr-4">
				<AvatarDropdown />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
