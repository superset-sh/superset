import type { MosaicBranch, MosaicNode } from "react-mosaic-component";

export enum TabType {
	Single = "single",
	Group = "group",
	Setup = "setup",
}

interface BaseTab {
	id: string;
	title: string;
	workspaceId: string;
	isNew?: boolean;
	parentId?: string;
	needsAttention?: boolean;
}

export interface SingleTab extends BaseTab {
	type: TabType.Single;
}

export interface TabGroup extends BaseTab {
	type: TabType.Group;
	layout: MosaicNode<string> | null;
}

export interface SetupTab extends BaseTab {
	type: TabType.Setup;
	setupCommands: string[];
	setupCwd: string;
	setupCopyResults?: { copied: string[]; errors: string[] };
}

export type Tab = SingleTab | TabGroup | SetupTab;

export interface TabsState {
	tabs: Tab[];
	activeTabIds: Record<string, string | null>;
	tabHistoryStacks: Record<string, string[]>;
}

export interface TabsStore extends TabsState {
	addTab: (workspaceId: string, type?: TabType) => void;
	addSetupTab: (
		workspaceId: string,
		setupCommands: string[],
		setupCwd: string,
		setupCopyResults?: { copied: string[]; errors: string[] },
	) => void;
	removeTab: (id: string) => void;
	renameTab: (id: string, newTitle: string) => void;
	setActiveTab: (workspaceId: string, tabId: string) => void;
	reorderTabs: (
		workspaceId: string,
		startIndex: number,
		endIndex: number,
	) => void;
	reorderTabById: (tabId: string, targetIndex: number) => void;
	markTabAsUsed: (id: string) => void;
	updateTabGroupLayout: (id: string, layout: MosaicNode<string>) => void;
	addChildTabToGroup: (groupId: string, childTabId: string) => void;
	removeChildTabFromGroup: (groupId: string, childTabId: string) => void;
	dragTabToTab: (draggedTabId: string, targetTabId: string) => void;
	ungroupTab: (tabId: string, targetIndex?: number) => void;
	ungroupTabs: (groupId: string) => void;
	splitTabVertical: (
		workspaceId: string,
		sourceTabId?: string,
		path?: MosaicBranch[],
	) => void;
	splitTabHorizontal: (
		workspaceId: string,
		sourceTabId?: string,
		path?: MosaicBranch[],
	) => void;
	getTabsByWorkspace: (workspaceId: string) => Tab[];
	getActiveTab: (workspaceId: string) => Tab | null;
	getLastActiveTabId: (workspaceId: string) => string | null;
	setNeedsAttention: (tabId: string, needsAttention: boolean) => void;
}
