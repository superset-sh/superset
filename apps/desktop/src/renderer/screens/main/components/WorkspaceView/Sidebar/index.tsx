import { useSidebarStore } from "renderer/stores";
import { SidebarMode } from "renderer/stores/sidebar-state";
import { ChangesView } from "./ChangesView";
import { ModeCarousel } from "./ModeCarousel";
import { TabsView } from "./TabsView";

export function Sidebar() {
	const { currentMode, setMode } = useSidebarStore();

	const modes: SidebarMode[] = [SidebarMode.Tabs, SidebarMode.Changes];

	return (
		<aside className="h-full flex flex-col overflow-hidden border-r border-border/50">
			<ModeCarousel
				modes={modes}
				currentMode={currentMode}
				onModeSelect={setMode}
			>
				{(mode) => {
					if (mode === SidebarMode.Changes) {
						return <ChangesView />;
					}

					return <TabsView />;
				}}
			</ModeCarousel>
		</aside>
	);
}
