import { type Tab, TabType, type WebViewTab } from "./types";
import { generateTerminalName } from "./utils/terminal-naming";

/**
 * Helper function to get child tab IDs for a given parent ID
 */
export const getChildTabIds = (tabs: Tab[], parentId: string): string[] => {
	return tabs.filter((t) => t.parentId === parentId).map((t) => t.id);
};

export interface CreateTabOptions {
	url?: string;
	title?: string;
}

export const createNewTab = (
	workspaceId: string,
	type: TabType = TabType.Single,
	existingTabs: Tab[] = [],
	options?: CreateTabOptions,
): Tab => {
	const id = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

	// Generate unique terminal name based on existing single tabs in the current workspace
	const existingNames = existingTabs
		.filter(
			(tab) => tab.workspaceId === workspaceId && tab.type === TabType.Single,
		)
		.map((tab) => tab.title);

	let title: string;
	if (options?.title) {
		title = options.title;
	} else if (type === TabType.Single) {
		title = generateTerminalName(existingNames);
	} else if (type === TabType.WebView) {
		title = "Cloud Terminal";
	} else {
		title = "New Split View";
	}

	const baseTab = {
		id,
		title,
		workspaceId,
		isNew: true,
	};

	if (type === TabType.Single) {
		return {
			...baseTab,
			type: TabType.Single,
		};
	}

	if (type === TabType.WebView) {
		if (!options?.url) {
			throw new Error("WebView tabs require a URL");
		}
		return {
			...baseTab,
			type: TabType.WebView,
			url: options.url,
		} as WebViewTab;
	}

	// For group tabs, just return the basic structure
	// Child tabs should be created separately and added via addChildTabToGroup
	return {
		...baseTab,
		type: TabType.Group,
		layout: null,
	};
};
