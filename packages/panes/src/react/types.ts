import type { ComponentType, ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { CreatePaneInput, WorkspaceStore } from "../core/store";
import type { Pane, Tab } from "../types";

export interface PaneActionConfig<TData> {
	key: string;
	icon: ReactNode | ((context: RendererContext<TData>) => ReactNode);
	tooltip: ReactNode | ((context: RendererContext<TData>) => ReactNode);
	onClick: (context: RendererContext<TData>) => void;
}

export interface ContextMenuActionConfig<TData> {
	key: string;
	label?: string;
	icon?: ReactNode;
	hotkeyId?: string;
	shortcut?: string;
	onSelect?: (context: RendererContext<TData>) => void;
	disabled?: boolean | ((context: RendererContext<TData>) => boolean);
	variant?: "destructive";
	type?: "item" | "separator";
	children?:
		| ContextMenuActionConfig<TData>[]
		| ((context: RendererContext<TData>) => ContextMenuActionConfig<TData>[]);
}

export interface PaneContext<TData> extends Pane<TData> {
	parentDirection: "horizontal" | "vertical" | null;
}

export interface TabContext<TData> extends Tab<TData> {
	position: number;
}

export interface RendererContext<TData> {
	pane: PaneContext<TData>;
	tab: TabContext<TData>;
	isActive: boolean;
	store: StoreApi<WorkspaceStore<TData>>;

	actions: {
		close: () => void;
		focus: () => void;
		setTitle: (title: string) => void;
		pin: () => void;
		updateData: (data: TData) => void;
		split: (
			position: "right" | "down",
			newPane: CreatePaneInput<TData>,
		) => void;
	};

	components: {
		PaneHeaderActions: ComponentType;
	};
}

export interface PaneDefinition<TData> {
	renderPane(context: RendererContext<TData>): ReactNode;
	getTitle?(pane: Pane<TData>): string | undefined;
	getIcon?(context: RendererContext<TData>): ReactNode;
	renderTitle?(context: RendererContext<TData>): ReactNode;
	renderHeaderExtras?(context: RendererContext<TData>): ReactNode;
	renderToolbar?(context: RendererContext<TData>): ReactNode;
	onHeaderClick?(context: RendererContext<TData>): void;
	onBeforeClose?(pane: Pane<TData>): boolean | Promise<boolean>;
	onRemoved?(pane: Pane<TData>): void;
	paneActions?:
		| PaneActionConfig<TData>[]
		| ((
				context: RendererContext<TData>,
				defaults: PaneActionConfig<TData>[],
		  ) => PaneActionConfig<TData>[]);
	contextMenuActions?:
		| ContextMenuActionConfig<TData>[]
		| ((
				context: RendererContext<TData>,
				defaults: ContextMenuActionConfig<TData>[],
		  ) => ContextMenuActionConfig<TData>[]);
}

export type PaneRegistry<TData> = Record<string, PaneDefinition<TData>>;

export interface WorkspaceProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	registry: PaneRegistry<TData>;
	className?: string;
	renderTabAccessory?: (tab: Tab<TData>) => ReactNode;
	renderTabIcon?: (tab: Tab<TData>) => ReactNode;
	renderEmptyState?: () => ReactNode;
	renderAddTabMenu?: () => ReactNode;
	renderBelowTabBar?: () => ReactNode;
	onBeforeClosePane?: (
		pane: Pane<TData>,
		tab: Tab<TData>,
	) => boolean | Promise<boolean>;
	onBeforeCloseTab?: (tab: Tab<TData>) => boolean | Promise<boolean>;
	paneActions?:
		| PaneActionConfig<TData>[]
		| ((context: RendererContext<TData>) => PaneActionConfig<TData>[]);
	contextMenuActions?:
		| ContextMenuActionConfig<TData>[]
		| ((context: RendererContext<TData>) => ContextMenuActionConfig<TData>[]);
}
