import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../core/store";
import type {
	LayoutNode,
	SplitPath,
	Tab as TabType,
} from "../../../../../types";
import type {
	ContextMenuActionConfig,
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
	contextMenuActions?:
		| ContextMenuActionConfig<TData>[]
		| ((context: RendererContext<TData>) => ContextMenuActionConfig<TData>[]);
}

function SplitView<TData>({
	store,
	tab,
	node,
	path,
	registry,
	paneActions,
	contextMenuActions,
}: {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	node: Extract<LayoutNode, { type: "split" }>;
	path: SplitPath;
	registry: PaneRegistry<TData>;
	paneActions?: TabProps<TData>["paneActions"];
	contextMenuActions?: TabProps<TData>["contextMenuActions"];
}) {
	const groupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null);
	const firstSize = node.splitPercentage ?? 50;
	const secondSize = 100 - firstSize;

	return (
		<ResizablePanelGroup
			ref={groupRef}
			direction={node.direction}
			onLayout={(sizes) => {
				if (sizes[0] != null) {
					store.getState().resizeSplit({
						tabId: tab.id,
						path,
						splitPercentage: sizes[0],
					});
				}
			}}
			onDoubleClick={(e) => {
				e.stopPropagation();
				groupRef.current?.setLayout([50, 50]);
			}}
		>
			<ResizablePanel defaultSize={firstSize}>
				<LayoutNodeView
					store={store}
					tab={tab}
					node={node.first}
					path={[...path, "first"]}
					registry={registry}
					paneActions={paneActions}
					contextMenuActions={contextMenuActions}
					parentDirection={node.direction}
				/>
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel defaultSize={secondSize}>
				<LayoutNodeView
					store={store}
					tab={tab}
					node={node.second}
					path={[...path, "second"]}
					registry={registry}
					paneActions={paneActions}
					contextMenuActions={contextMenuActions}
					parentDirection={node.direction}
				/>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function LayoutNodeView<TData>({
	store,
	tab,
	node,
	path,
	registry,
	paneActions,
	contextMenuActions,
	parentDirection = null,
}: {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: TabType<TData>;
	node: LayoutNode;
	path: SplitPath;
	registry: PaneRegistry<TData>;
	paneActions?: TabProps<TData>["paneActions"];
	contextMenuActions?: TabProps<TData>["contextMenuActions"];
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
				contextMenuActions={contextMenuActions}
				parentDirection={parentDirection}
			/>
		);
	}

	return (
		<SplitView
			store={store}
			tab={tab}
			node={node}
			path={path}
			registry={registry}
			paneActions={paneActions}
			contextMenuActions={contextMenuActions}
		/>
	);
}

export function Tab<TData>({
	store,
	tab,
	registry,
	paneActions,
	contextMenuActions,
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
				path={[]}
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
			/>
		</div>
	);
}
