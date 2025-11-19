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
}

// Single tab - single content view
export interface SingleTab extends BaseTab {
	type: TabType.Single;
}

// Tab group - split view using react-mosaic
export interface TabGroup extends BaseTab {
	type: TabType.Group;
	// MosaicNode describes the layout structure (split direction and children)
	layout: MosaicNode<string>;
	// Map of pane IDs to their content/metadata
	panes: Record<string, { title: string }>;
}

// Union type for all tab types
export type Tab = SingleTab | TabGroup;
