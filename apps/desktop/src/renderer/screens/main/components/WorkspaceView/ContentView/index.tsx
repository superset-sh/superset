import { trpc } from "renderer/lib/trpc";
import { useWorkspaceViewModeStore } from "renderer/stores/workspace-view-mode";
import { SidebarControl } from "../../SidebarControl";
import { WorkspaceControls } from "../../TopBar/WorkspaceControls";
import { ChangesContent } from "./ChangesContent";
import { ContentHeader } from "./ContentHeader";
import { TabsContent } from "./TabsContent";
import { GroupStrip } from "./TabsContent/GroupStrip";

export function ContentView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;

	// Subscribe to the actual data, not just the getter function
	const viewModeByWorkspaceId = useWorkspaceViewModeStore(
		(s) => s.viewModeByWorkspaceId,
	);

	const viewMode = workspaceId
		? (viewModeByWorkspaceId[workspaceId] ?? "workbench")
		: "workbench";

	const showGroupStrip = viewMode === "workbench";

	const workspaceControls = (
		<WorkspaceControls workspaceId={activeWorkspace?.id} />
	);

	if (viewMode === "review") {
		return (
			<div className="h-full flex flex-col overflow-hidden">
				<ContentHeader
					leadingAction={<SidebarControl />}
					trailingAction={workspaceControls}
				>
					{/* Review mode has no group tabs */}
					<div />
				</ContentHeader>
				<div className="flex-1 overflow-hidden bg-tertiary">
					<div className="h-full bg-background overflow-hidden border border-border">
						<ChangesContent />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<ContentHeader
				leadingAction={<SidebarControl />}
				trailingAction={workspaceControls}
			>
				{showGroupStrip ? <GroupStrip /> : <div />}
			</ContentHeader>
			<TabsContent />
		</div>
	);
}
