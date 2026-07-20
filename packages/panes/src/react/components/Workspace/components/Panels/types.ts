import type { ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../core/store";
import type { DerivedPanels } from "../../../../../core/store/panels";
import type { Tab } from "../../../../../types";
import type {
	ContextMenuActionConfig,
	PaneActionConfig,
	PaneRegistry,
	RendererContext,
} from "../../../../types";

/** Everything a panel leaf needs, threaded through the recursive tree */
export interface PanelsContext<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	registry: PaneRegistry<TData>;
	derived: DerivedPanels;
	tabsById: Map<string, Tab<TData>>;
	/** Panel whose bar hosts the workspace-level trailing controls */
	topRightPanelId: string;
	closeTab: (tabId: string) => Promise<void>;
	renderTabIcon?: (tab: Tab<TData>) => ReactNode;
	renderAddTabMenu?: (context: { panelId: string }) => ReactNode;
	renderTabBarTrailing?: () => ReactNode;
	renderTabAccessory?: (tab: Tab<TData>) => ReactNode;
	renderEmptyState?: () => ReactNode;
	paneActions?:
		| PaneActionConfig<TData>[]
		| ((context: RendererContext<TData>) => PaneActionConfig<TData>[]);
	contextMenuActions?:
		| ContextMenuActionConfig<TData>[]
		| ((context: RendererContext<TData>) => ContextMenuActionConfig<TData>[]);
	onSplitResizeDragging?: (sourceId: string, isDragging: boolean) => void;
}
