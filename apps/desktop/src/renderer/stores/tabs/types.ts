import type { MosaicNode } from "react-mosaic-component";

// Tab types
export enum TabType {
	Single = "single",
	Group = "group",
}

// Base tab interface
interface BaseTab {
	id: string;
	title: string;
	workspaceId: string;
	isNew?: boolean;
	parentId?: string; // ID of parent tab if this is a child pane
}

// Single tab - single content view
export interface SingleTab extends BaseTab {
	type: TabType.Single;
}

// Tab group - split view using react-mosaic
export interface TabGroup extends BaseTab {
	type: TabType.Group;
	// MosaicNode describes the layout structure (split direction and children)
	// Now uses tab IDs instead of pane IDs
	// Can be null if no children yet
	layout: MosaicNode<string> | null;
	// Array of child tab IDs
	childTabIds: string[];
}

// Union type for all tab types
export type Tab = SingleTab | TabGroup;
