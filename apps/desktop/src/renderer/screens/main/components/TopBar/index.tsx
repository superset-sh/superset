import { trpc } from "renderer/lib/trpc";
import { WorkspaceHeader } from "../WorkspaceView/WorkspaceHeader";
import { HelpMenu } from "./HelpMenu";
import { SettingsButton } from "./SettingsButton";
import { SidebarControl } from "./SidebarControl";
import { WindowControls } from "./WindowControls";
import { WorkspacesTabs } from "./WorkspaceTabs";

export function TopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const isMac = platform === "darwin";
	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background">
			<div
				className="flex items-center gap-4 h-full"
				style={{
					paddingLeft: isMac ? "80px" : "16px",
				}}
			>
				<SidebarControl />
			</div>
			<div className="flex items-center gap-2 flex-1 overflow-hidden h-full">
				<WorkspacesTabs />
			</div>
			<div className="flex items-center h-full pr-4">
				<WorkspaceHeader worktreePath={activeWorkspace?.worktreePath} />
				<SettingsButton />
				<HelpMenu />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
