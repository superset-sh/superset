import { trpc } from "renderer/lib/trpc";
import { SidebarControl } from "../../SidebarControl";
import { WorkspaceControls } from "../../TopBar/WorkspaceControls";
import { ContentHeader } from "./ContentHeader";
import { TabsContent } from "./TabsContent";
import { GroupStrip } from "./TabsContent/GroupStrip";

export function ContentView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	const workspaceControls = (
		<WorkspaceControls worktreePath={activeWorkspace?.worktreePath} />
	);

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<ContentHeader
				leadingAction={<SidebarControl />}
				trailingAction={workspaceControls}
			>
				<GroupStrip />
			</ContentHeader>
			<TabsContent />
		</div>
	);
}
