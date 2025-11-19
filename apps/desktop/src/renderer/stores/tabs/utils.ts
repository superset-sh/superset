import { type Tab, type TabGroup, TabType } from "./types";

export const createNewTab = (
	workspaceId: string,
	type: TabType = TabType.Single,
): Tab => {
	const id = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
	const baseTab = {
		id,
		title: type === TabType.Single ? "New Tab" : "New Split View",
		workspaceId,
		isNew: true,
	};

	if (type === TabType.Single) {
		return {
			...baseTab,
			type: TabType.Single,
		};
	}

	// Create a default split view with two panes
	const pane1 = `pane-${Date.now()}-1`;
	const pane2 = `pane-${Date.now()}-2`;

	return {
		...baseTab,
		type: TabType.Group,
		layout: {
			direction: "row",
			first: pane1,
			second: pane2,
			splitPercentage: 50,
		},
		panes: {
			[pane1]: { title: "Pane 1" },
			[pane2]: { title: "Pane 2" },
		},
	};
};
