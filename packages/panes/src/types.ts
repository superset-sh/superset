export type SplitDirection = "horizontal" | "vertical";

export type SplitPosition = "top" | "right" | "bottom" | "left";

export type LayoutNode =
	| { type: "pane"; paneId: string }
	| {
			type: "split";
			id: string;
			direction: SplitDirection;
			children: LayoutNode[];
			weights: number[];
	  };

export interface Pane<TData> {
	id: string;
	kind: string;
	titleOverride?: string;
	pinned?: boolean;
	data: TData;
}

export interface Tab<TData> {
	id: string;
	titleOverride?: string;
	createdAt: number;
	activePaneId: string | null;
	layout: LayoutNode;
	panes: Record<string, Pane<TData>>;
}

export interface WorkspaceState<TData> {
	version: 1;
	tabs: Tab<TData>[];
	activeTabId: string | null;
}
