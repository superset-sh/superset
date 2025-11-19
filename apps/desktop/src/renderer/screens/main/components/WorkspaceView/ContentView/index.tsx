import { SidebarMode, useSidebarStore } from "renderer/stores";
import { ChangesContent } from "./ChangesContent";
import { TabsContent } from "./TabsContent";

export function ContentView() {
	const { currentMode } = useSidebarStore();

	if (currentMode === SidebarMode.Changes) {
		return <ChangesContent />;
	}

	return <TabsContent />;
}
