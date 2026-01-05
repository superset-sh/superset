import { trpc } from "renderer/lib/trpc";
import { AvatarDropdown } from "../AvatarDropdown";
import { WindowControls } from "./WindowControls";
import { OpenInMenuButton } from "./WorkspaceControls/OpenInMenuButton";
import { WorkspaceSidebarControl } from "./WorkspaceSidebarControl";

export function TopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background border-b border-border">
			<div
				className="flex items-center gap-2 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			>
				<WorkspaceSidebarControl />
			</div>

			<div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden h-full px-4">
				{activeWorkspace && (
					<span className="text-sm font-medium truncate">
						{activeWorkspace.project?.name ?? "Workspace"}
						<span className="text-muted-foreground mx-2">/</span>
						{activeWorkspace.name}
					</span>
				)}
			</div>

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{activeWorkspace?.worktreePath && (
					<OpenInMenuButton
						worktreePath={activeWorkspace.worktreePath}
						branch={activeWorkspace.worktree?.branch}
					/>
				)}
				<AvatarDropdown />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
