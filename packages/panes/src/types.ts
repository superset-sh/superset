export type SplitDirection = "horizontal" | "vertical";

export type SplitPosition = "top" | "right" | "bottom" | "left";

export type SplitBranch = "first" | "second";

export type SplitPath = SplitBranch[];

export type LayoutNode =
	| { type: "pane"; paneId: string }
	| {
			type: "split";
			direction: SplitDirection;
			first: LayoutNode;
			second: LayoutNode;
			splitPercentage?: number;
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
	/**
	 * Panel (VS Code-style editor group) this tab lives in. Tabs with a
	 * missing/unknown panelId resolve to the workspace's first panel.
	 */
	panelId?: string;
}

export interface WorkspaceState<TData> {
	version: 1;
	tabs: Tab<TData>[];
	activeTabId: string | null;
	/**
	 * Panel split tree. Reuses LayoutNode — leaves are `{ type: "pane" }`
	 * nodes whose `paneId` carries a *panel* id. Missing/null means a single
	 * implicit panel holding all tabs.
	 */
	panelLayout?: LayoutNode | null;
	/** Active (visible) tab per panel. Stale entries are ignored on read. */
	panelActiveTabIds?: Record<string, string>;
}
