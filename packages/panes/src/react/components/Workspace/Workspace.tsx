import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { deriveWorkspacePanels } from "../../../core/store/panels";
import type { Pane, PanelLayoutNode, Tab as TabType } from "../../../types";
import type { WorkspaceProps } from "../../types";
import { Panels, type PanelsContext } from "./components/Panels";
import { DropPreviewOverlay } from "./components/Panels/components/DropPreviewOverlay";
import { useWorkspaceInteractionState } from "./hooks/useWorkspaceInteractionState";

/** Panel touching the top-right corner (hosts workspace-level controls) */
function findTopRightPanelId(node: PanelLayoutNode): string {
	if (node.type === "pane") {
		return node.paneId;
	}
	return findTopRightPanelId(
		node.direction === "horizontal" ? node.second : node.first,
	);
}

export function Workspace<TData>({
	store,
	registry,
	className,
	renderTabAccessory,
	renderTabIcon,
	renderEmptyState,
	renderAddTabMenu,
	renderTabBarTrailing,
	renderBelowTabBar,
	onBeforeCloseTab,
	onAfterCloseTab,
	onInteractionStateChange,
	paneActions,
	contextMenuActions,
}: WorkspaceProps<TData>) {
	const tabs = useStore(store, (s) => s.tabs);
	const activeTabId = useStore(store, (s) => s.activeTabId);
	const panelLayout = useStore(store, (s) => s.panelLayout);
	const panelActiveTabIds = useStore(store, (s) => s.panelActiveTabIds);
	const { onSplitResizeDragging } = useWorkspaceInteractionState({
		onInteractionStateChange,
	});

	const derived = useMemo(
		() =>
			deriveWorkspacePanels({
				tabs,
				activeTabId,
				panelLayout,
				panelActiveTabIds,
			}),
		[tabs, activeTabId, panelLayout, panelActiveTabIds],
	);

	const tabsById = useMemo(() => {
		const map = new Map<string, TabType<TData>>();
		for (const tab of tabs) {
			map.set(tab.id, tab);
		}
		return map;
	}, [tabs]);

	const previousPanesRef = useRef<Map<string, Pane<TData>>>(new Map());
	useEffect(() => {
		const current = new Map<string, Pane<TData>>();
		for (const tab of tabs) {
			for (const pane of Object.values(tab.panes)) {
				current.set(pane.id, pane);
			}
		}
		for (const [prevId, prevPane] of previousPanesRef.current) {
			if (!current.has(prevId)) {
				registry[prevPane.kind]?.onAfterClose?.(prevPane);
			}
		}
		previousPanesRef.current = current;
	}, [tabs, registry]);

	const closeTab = async (tabId: string) => {
		const tab = store.getState().getTab(tabId);
		if (!tab) return;
		if (onBeforeCloseTab) {
			const allowed = await onBeforeCloseTab(tab);
			if (!allowed) return;
		}
		// Re-check after the await: the tab may have been removed concurrently.
		if (!store.getState().getTab(tabId)) return;
		store.getState().removeTab(tabId);
		try {
			onAfterCloseTab?.(tab);
		} catch (err) {
			console.error("onAfterCloseTab threw", err);
		}
	};

	const panelsContext: PanelsContext<TData> = {
		store,
		registry,
		derived,
		tabsById,
		topRightPanelId: findTopRightPanelId(derived.layout),
		closeTab,
		renderTabIcon,
		renderAddTabMenu,
		renderTabBarTrailing,
		renderTabAccessory,
		renderEmptyState,
		paneActions,
		contextMenuActions,
		onSplitResizeDragging,
	};

	return (
		<div
			className={cn(
				"flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground",
				className,
			)}
		>
			{renderBelowTabBar?.()}
			<div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<Panels node={derived.layout} path={[]} context={panelsContext} />
				<DropPreviewOverlay store={store} />
			</div>
		</div>
	);
}
