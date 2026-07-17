import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { useEffect, useRef } from "react";
import type { PanelLayoutNode, SplitPath } from "../../../../../types";
import { PanelSection } from "./components/PanelSection";
import type { PanelsContext } from "./types";

interface PanelsProps<TData> {
	/** Panel split tree (leaves carry panel ids) */
	node: PanelLayoutNode;
	path: SplitPath;
	context: PanelsContext<TData>;
}

function PanelSplit<TData>({
	node,
	path,
	context,
}: {
	node: Extract<PanelLayoutNode, { type: "split" }>;
	path: SplitPath;
	context: PanelsContext<TData>;
}) {
	const groupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null);
	const firstSize = node.splitPercentage ?? 50;
	const resizeSourceId = `panels:${path.join(".") || "root"}`;

	// Panel groups are uncontrolled after mount; apply store-driven size
	// changes (e.g. "equalize panels") imperatively. User drags no-op here
	// because onLayout already wrote the same value back to the store.
	useEffect(() => {
		const group = groupRef.current;
		if (!group) return;
		const current = group.getLayout()[0];
		if (current != null && Math.abs(current - firstSize) > 0.5) {
			group.setLayout([firstSize, 100 - firstSize]);
		}
	}, [firstSize]);

	return (
		<ResizablePanelGroup
			ref={groupRef}
			className="min-h-full min-w-full"
			direction={node.direction}
			onLayout={(sizes) => {
				if (sizes[0] != null) {
					context.store.getState().resizePanelSplit({
						path,
						splitPercentage: sizes[0],
					});
				}
			}}
		>
			<ResizablePanel className="min-h-0 min-w-0" defaultSize={firstSize}>
				<Panels node={node.first} path={[...path, "first"]} context={context} />
			</ResizablePanel>
			<ResizableHandle
				onDragging={(isDragging) =>
					context.onSplitResizeDragging?.(resizeSourceId, isDragging)
				}
				onDoubleClick={(e) => {
					e.stopPropagation();
					groupRef.current?.setLayout([50, 50]);
				}}
			/>
			<ResizablePanel className="min-h-0 min-w-0" defaultSize={100 - firstSize}>
				<Panels
					node={node.second}
					path={[...path, "second"]}
					context={context}
				/>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

/**
 * Recursive VS Code-style panel (editor group) grid: resizable splits whose
 * leaves each render a tab bar + the panel's active tab.
 */
export function Panels<TData>({ node, path, context }: PanelsProps<TData>) {
	if (node.type === "pane") {
		return <PanelSection panelId={node.paneId} context={context} />;
	}

	return <PanelSplit node={node} path={path} context={context} />;
}
