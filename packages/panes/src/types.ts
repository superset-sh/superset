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
}

export interface WorkspaceState<TData> {
	version: 1;
	tabs: Tab<TData>[];
	activeTabId: string | null;
	/**
	 * Bounded, most-recent-first stack of recently closed tabs, persisted with
	 * the pane layout so "Reopen Closed Tab" can recover a tab across the same
	 * workspace session. Optional for backwards compatibility with older
	 * persisted layouts that predate this field.
	 */
	closedTabs?: Tab<TData>[];
}
