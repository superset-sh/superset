import { useTabsStore } from "renderer/stores/tabs";
import { CenterView } from "./CenterView";
import { NewTabView } from "./NewTabView";
import { Sidebar } from "./Sidebar";

export function TabView() {
	const { tabs, activeTabId } = useTabsStore();
	const activeTab = tabs.find((tab) => tab.id === activeTabId);

	if (activeTab?.isNew) {
		return (
			<div className="flex flex-1">
				<NewTabView />
			</div>
		);
	}

	return (
		<div className="flex flex-1">
			<Sidebar />
			<CenterView />
		</div>
	);
}
