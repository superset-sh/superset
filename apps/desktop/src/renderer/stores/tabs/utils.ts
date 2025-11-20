import { type Tab, TabType } from "./types";

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

	// For group tabs, just return the basic structure
	// Child tabs should be created separately and added via addChildTabToGroup
	return {
		...baseTab,
		type: TabType.Group,
		layout: null,
		childTabIds: [],
	};
};
