import { SidebarMode, useSidebarStore } from "renderer/stores";
import { ChangesContent } from "./ChangesContent";
import { TabsContent } from "./TabsContent";

export function ContentView() {
	const { currentMode } = useSidebarStore();

	if (currentMode === SidebarMode.Changes) {
		return (
			<div className="h-full overflow-hidden bg-tertiary p-1">
				<div className="h-full bg-background rounded-lg overflow-hidden border border-border">
					<ChangesContent />
				</div>
			</div>
		);
	}

	return <TabsContent />;
}
