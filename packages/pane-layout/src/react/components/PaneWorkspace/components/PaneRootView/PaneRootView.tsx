import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../../../core/store";
import type { PaneRootState } from "../../../../../types";
import type { PaneRegistry, PaneRendererContext } from "../../../../types";
import { PaneNodeView } from "../PaneNodeView";

interface PaneRootViewProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	root: PaneRootState<TPaneData> | null;
	registry: PaneRegistry<TPaneData>;
	onAddPane?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
		root: PaneRootState<TPaneData>;
		group: import("../../../../../types").PaneGroupNode<TPaneData>;
	}) => void;
	renderEmptyState?: () => React.ReactNode;
	renderUnknownPane?: (
		context: PaneRendererContext<TPaneData>,
	) => React.ReactNode;
}

export function PaneRootView<TPaneData>({
	store,
	root,
	registry,
	onAddPane,
	renderEmptyState,
	renderUnknownPane,
}: PaneRootViewProps<TPaneData>) {
	if (!root) {
		return (
			<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
				{renderEmptyState?.() ?? "No panes open"}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
			<PaneNodeView
				node={root.root}
				registry={registry}
				onAddPane={onAddPane}
				renderUnknownPane={renderUnknownPane}
				root={root}
				store={store}
			/>
		</div>
	);
}
