export interface DragItem {
	type: "TAB";
	tabId: string;
}

export const TAB_DND_TYPE = "TAB";

export interface TabItemProps {
	tabId: string;
	title: string;
	isActive: boolean;
}
