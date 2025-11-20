import { trpc } from "renderer/lib/trpc";
import { SidebarControl } from "./SidebarControl";
import { WindowControls } from "./WindowControls";
import { WorkspacesTabs } from "./WorkspaceTabs";

export function TopBar() {
	const { data: platform } = trpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between border-b border-sidebar bg-background">
			<div
				className="flex items-center gap-4 h-full"
				style={{
					paddingLeft: isMac ? "80px" : "16px",
				}}
			>
				<SidebarControl />
			</div>
			<div className="no-drag flex items-center gap-2 flex-1 overflow-hidden h-full">
				<WorkspacesTabs />
			</div>
			<div className="no-drag flex items-center gap-2 h-full pr-4">
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
