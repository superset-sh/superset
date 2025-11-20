import type { MosaicNode } from "react-mosaic-component";

export enum TabType {
	Single = "single",
	Group = "group",
}

interface BaseTab {
	id: string;
	title: string;
	workspaceId: string;
	isNew?: boolean;
	parentId?: string;
}

export interface SingleTab extends BaseTab {
	type: TabType.Single;
}

export interface TabGroup extends BaseTab {
	type: TabType.Group;
	layout: MosaicNode<string> | null;
}

export type Tab = SingleTab | TabGroup;
