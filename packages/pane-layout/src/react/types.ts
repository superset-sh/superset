import type { ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../core/store";
import type { PaneGroupNode, PaneRootState, PaneState } from "../types";

export interface PaneRendererContext<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	root: PaneRootState<TPaneData>;
	group: PaneGroupNode<TPaneData>;
	pane: PaneState<TPaneData>;
	isActive: boolean;
}

export interface PaneDefinition<TPaneData> {
	renderPane: (context: PaneRendererContext<TPaneData>) => ReactNode;
	getTitle?: (context: PaneRendererContext<TPaneData>) => ReactNode;
	getIcon?: (context: PaneRendererContext<TPaneData>) => ReactNode;
	renderTabAccessory?: (context: PaneRendererContext<TPaneData>) => ReactNode;
}

export type PaneRegistry<TPaneData> = Record<string, PaneDefinition<TPaneData>>;

export interface PaneWorkspaceProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	registry: PaneRegistry<TPaneData>;
	className?: string;
	getRootTitle?: (root: PaneRootState<TPaneData>) => ReactNode;
	onAddRoot?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	}) => void;
	renderAddRootMenu?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	}) => ReactNode;
	onAddPane?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
		root: PaneRootState<TPaneData>;
		group: PaneGroupNode<TPaneData>;
	}) => void;
	renderEmptyState?: () => ReactNode;
	renderUnknownPane?: (context: PaneRendererContext<TPaneData>) => ReactNode;
}
