import { SidebarMode, useSidebarStore } from "renderer/stores";
import { ChangesContent } from "./ChangesContent";
import { TabsContent } from "./TabsContent";

export function ContentView() {
	const { currentMode } = useSidebarStore();

	if (currentMode === SidebarMode.Changes) {
		return (
			<div className="h-full p-1 bg-tertiary">
				<div className="h-full bg-background rounded-lg">
					<ChangesContent />
				</div>
			</div>
		);
	}

	return <TabsContent />;
}
