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

/**
 * The panel (editor group) split tree. Structurally a `LayoutNode` so the
 * tree utilities apply, but leaves carry a **panel id** in `paneId` — both in
 * memory and in persisted JSON. Use this alias wherever a tree of panels (not
 * panes) is meant.
 */
export type PanelLayoutNode = LayoutNode;

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
	 * Panel split tree; missing/null means a single implicit panel holding
	 * all tabs. See `PanelLayoutNode` for the leaf semantics.
	 */
	panelLayout?: PanelLayoutNode | null;
	/** Active (visible) tab per panel. Stale entries are ignored on read. */
	panelActiveTabIds?: Record<string, string>;
}
