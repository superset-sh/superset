import { cn } from "@superset/ui/lib/utils";
import { usePaneWorkspaceStore } from "../../hooks";
import type { PaneWorkspaceProps } from "../../types";
import { PaneRootTabs } from "./components/PaneRootTabs";
import { PaneRootView } from "./components/PaneRootView";

export function PaneWorkspace<TPaneData>({
	store,
	registry,
	className,
	getRootTitle,
	onAddRoot,
	renderAddRootMenu,
	onAddPane,
	renderEmptyState,
	renderUnknownPane,
}: PaneWorkspaceProps<TPaneData>) {
	const roots = usePaneWorkspaceStore(store, (state) => state.state.roots);
	const activeRootId = usePaneWorkspaceStore(
		store,
		(state) => state.state.activeRootId,
	);
	const activeRoot =
		roots.find((root) => root.id === activeRootId) ?? roots[0] ?? null;

	return (
		<div
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background text-foreground shadow-xs",
				className,
			)}
		>
			<PaneRootTabs
				activeRootId={activeRootId}
				getRootTitle={getRootTitle}
				onAddRoot={onAddRoot}
				renderAddRootMenu={renderAddRootMenu}
				onSelectRoot={(rootId) => store.getState().setActiveRoot(rootId)}
				roots={roots}
				store={store}
			/>
			<PaneRootView
				registry={registry}
				onAddPane={onAddPane}
				renderEmptyState={renderEmptyState}
				renderUnknownPane={renderUnknownPane}
				root={activeRoot}
				store={store}
			/>
		</div>
	);
}
