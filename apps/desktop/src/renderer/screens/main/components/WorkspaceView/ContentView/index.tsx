import { SidebarControl } from "../../SidebarControl";
import { ContentHeader } from "./ContentHeader";
import { TabsContent } from "./TabsContent";
import { GroupStrip } from "./TabsContent/GroupStrip";

export function ContentView() {
	return (
		<div className="h-full flex flex-col overflow-hidden">
			<ContentHeader trailingAction={<SidebarControl />}>
				<GroupStrip />
			</ContentHeader>
			<TabsContent />
		</div>
	);
}
