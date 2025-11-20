import type { Tab } from "renderer/stores/tabs/types";

export interface DragItem {
	type: "TAB";
	tabId: string;
}

export const TAB_DND_TYPE = "TAB";

export interface TabItemProps {
	tab: Tab;
	childTabs?: Tab[];
}
