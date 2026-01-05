import { SidebarControl } from "../../SidebarControl";
import { WorkspaceControls } from "../../TopBar/WorkspaceControls";
import { ContentHeader } from "./ContentHeader";
import { TabsContent } from "./TabsContent";
import { GroupStrip } from "./TabsContent/GroupStrip";

export function ContentView() {
	return (
		<div className="h-full flex flex-col overflow-hidden">
			<ContentHeader
				trailingAction={
					<>
						<WorkspaceControls />
						<SidebarControl />
					</>
				}
			>
				<GroupStrip />
			</ContentHeader>
			<TabsContent />
		</div>
	);
}
