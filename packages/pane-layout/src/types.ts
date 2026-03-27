export type PaneSplitDirection = "horizontal" | "vertical";
export type PaneSplitPosition = "top" | "right" | "bottom" | "left";

export interface PaneState<TPaneData> {
	id: string;
	kind: string;
	titleOverride?: string;
	pinned?: boolean;
	data: TPaneData;
}

export interface PaneGroupNode<TPaneData> {
	type: "group";
	id: string;
	activePaneId: string | null;
	panes: Array<PaneState<TPaneData>>;
}

export interface PaneSplitNode<TPaneData> {
	type: "split";
	id: string;
	direction: PaneSplitDirection;
	sizes: number[];
	children: Array<PaneLayoutNode<TPaneData>>;
}

export type PaneLayoutNode<TPaneData> =
	| PaneGroupNode<TPaneData>
	| PaneSplitNode<TPaneData>;

export interface PaneRootState<TPaneData> {
	id: string;
	titleOverride?: string;
	root: PaneLayoutNode<TPaneData>;
	activeGroupId: string | null;
}

export interface PaneWorkspaceState<TPaneData> {
	version: 1;
	roots: Array<PaneRootState<TPaneData>>;
	activeRootId: string | null;
}

export type DropTarget =
	| {
			type: "group-center";
			rootId: string;
			groupId: string;
	  }
	| {
			type: "split";
			rootId: string;
			groupId: string;
			position: PaneSplitPosition;
	  };
