import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../../../core/store";
import type { PaneLayoutNode, PaneRootState } from "../../../../../types";
import type { PaneRegistry, PaneRendererContext } from "../../../../types";
import { PaneGroup } from "../PaneGroup";
import { PaneSplitHandle } from "../PaneSplitHandle";

interface PaneNodeViewProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	root: PaneRootState<TPaneData>;
	node: PaneLayoutNode<TPaneData>;
	registry: PaneRegistry<TPaneData>;
	onAddPane?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
		root: PaneRootState<TPaneData>;
		group: import("../../../../../types").PaneGroupNode<TPaneData>;
	}) => void;
	renderUnknownPane?: (
		context: PaneRendererContext<TPaneData>,
	) => React.ReactNode;
}

export function PaneNodeView<TPaneData>({
	store,
	root,
	node,
	registry,
	onAddPane,
	renderUnknownPane,
}: PaneNodeViewProps<TPaneData>) {
	if (node.type === "group") {
		return (
			<PaneGroup
				group={node}
				registry={registry}
				onAddPane={onAddPane}
				renderUnknownPane={renderUnknownPane}
				root={root}
				store={store}
			/>
		);
	}

	const isHorizontal = node.direction === "horizontal";

	return (
		<div
			className={[
				"flex min-h-0 min-w-0 flex-1 overflow-hidden",
				isHorizontal ? "flex-row" : "flex-col",
			].join(" ")}
		>
			{node.children.flatMap((child, index) => {
				const items = [
					<div
						className="flex min-h-0 min-w-0 overflow-hidden"
						key={child.id}
						style={{
							flexBasis: 0,
							flexGrow: node.sizes[index] ?? 1,
							flexShrink: 1,
						}}
					>
						<PaneNodeView
							node={child}
							registry={registry}
							onAddPane={onAddPane}
							renderUnknownPane={renderUnknownPane}
							root={root}
							store={store}
						/>
					</div>,
				];

				if (index < node.children.length - 1) {
					items.push(
						<PaneSplitHandle
							key={`${node.id}:separator:${index}`}
							onDoubleClick={() =>
								store.getState().equalizeSplit({
									rootId: root.id,
									splitId: node.id,
								})
							}
							orientation={node.direction}
						/>,
					);
				}

				return items;
			})}
		</div>
	);
}
