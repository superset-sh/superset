import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../../../core/store";
import type {
	PaneGroupNode,
	PaneRootState,
	PaneState,
} from "../../../../../types";
import type { PaneRegistry, PaneRendererContext } from "../../../../types";

interface PaneContentProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	root: PaneRootState<TPaneData>;
	group: PaneGroupNode<TPaneData>;
	pane: PaneState<TPaneData>;
	registry: PaneRegistry<TPaneData>;
	renderUnknownPane?: (
		context: PaneRendererContext<TPaneData>,
	) => React.ReactNode;
}

export function PaneContent<TPaneData>({
	store,
	root,
	group,
	pane,
	registry,
	renderUnknownPane,
}: PaneContentProps<TPaneData>) {
	const definition = registry[pane.kind];
	const context: PaneRendererContext<TPaneData> = {
		store,
		root,
		group,
		pane,
		isActive: group.activePaneId === pane.id,
	};

	return (
		<div className="flex min-h-0 min-w-0 flex-1 overflow-auto">
			{definition
				? definition.renderPane(context)
				: (renderUnknownPane?.(context) ?? (
						<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
							Unknown pane kind: {pane.kind}
						</div>
					))}
		</div>
	);
}
