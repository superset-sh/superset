import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../core/store";
import type { LayoutNode, Tab as TabType } from "../../../../../types";
import type {
	PaneActionConfig,
	PaneRegistry,
	RendererContext,
} from "../../../../types";
import { Pane } from "./components/Pane";

interface TabProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	registry: PaneRegistry<TData>;
	paneActions?:
		| PaneActionConfig<TData>[]
		| ((context: RendererContext<TData>) => PaneActionConfig<TData>[]);
}

function weightsToPercentages(weights: number[]): number[] {
	const total = weights.reduce((sum, w) => sum + w, 0);
	if (total === 0) return weights.map(() => 100 / weights.length);
	return weights.map((w) => (w / total) * 100);
}

function SplitView<TData>({
	store,
	tab,
	node,
	registry,
	paneActions,
}: {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	node: Extract<LayoutNode, { type: "split" }>;
	registry: PaneRegistry<TData>;
	paneActions?: TabProps<TData>["paneActions"];
}) {
	const groupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null);
	const percentages = weightsToPercentages(node.weights);

	return (
		<ResizablePanelGroup
			ref={groupRef}
			direction={node.direction}
			onLayout={(sizes) => {
				store.getState().resizeSplit({
					tabId: tab.id,
					splitId: node.id,
					weights: sizes,
				});
			}}
			onDoubleClick={(e) => {
				e.stopPropagation();
				const equal = node.children.map(() => 100 / node.children.length);
				groupRef.current?.setLayout(equal);
			}}
		>
			{node.children.map((child, index) => {
				const key = child.type === "pane" ? child.paneId : child.id;
				return (
					<>
						{index > 0 && <ResizableHandle key={`handle-${key}`} />}
						<ResizablePanel key={key} defaultSize={percentages[index]}>
							<LayoutNodeView
								store={store}
								tab={tab}
								node={child}
								registry={registry}
								paneActions={paneActions}
								parentDirection={node.direction}
							/>
						</ResizablePanel>
					</>
				);
			})}
		</ResizablePanelGroup>
	);
}

function LayoutNodeView<TData>({
	store,
	tab,
	node,
	registry,
	paneActions,
	parentDirection = null,
}: {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	node: LayoutNode;
	registry: PaneRegistry<TData>;
	paneActions?: TabProps<TData>["paneActions"];
	parentDirection?: "horizontal" | "vertical" | null;
}) {
	if (node.type === "pane") {
		const pane = tab.panes[node.paneId];
		if (!pane) return null;

		return (
			<Pane
				store={store}
				tab={tab}
				pane={pane}
				isActive={tab.activePaneId === pane.id}
				registry={registry}
				paneActions={paneActions}
				parentDirection={parentDirection}
			/>
		);
	}

	return (
		<SplitView
			store={store}
			tab={tab}
			node={node}
			registry={registry}
			paneActions={paneActions}
		/>
	);
}

export function Tab<TData>({
	store,
	tab,
	registry,
	paneActions,
}: TabProps<TData>) {
	if (!tab.layout) {
		return (
			<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
				No panes open
			</div>
		);
	}

	return (
		<div className="flex h-full w-full min-h-0 min-w-0 overflow-hidden">
			<LayoutNodeView
				store={store}
				tab={tab}
				node={tab.layout}
				registry={registry}
				paneActions={paneActions}
			/>
		</div>
	);
}
