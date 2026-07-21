import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef } from "react";
import { useDragLayer } from "react-dnd";
import { useStore } from "zustand";
import type { Pane } from "../../../types";
import type { WorkspaceProps } from "../../types";
import { Tab } from "./components/Tab";
import { TabBar } from "./components/TabBar";
import { TAB_DRAG_TYPE } from "./components/TabBar/components/TabItem";
import { useWorkspaceInteractionState } from "./hooks/useWorkspaceInteractionState";

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
	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
	const { onSplitResizeDragging } = useWorkspaceInteractionState({
		onInteractionStateChange,
	});

	// The tab id currently being dragged in the tab bar, if any.
	const draggedTabId = useDragLayer((monitor) => {
		if (!monitor.isDragging() || monitor.getItemType() !== TAB_DRAG_TYPE) {
			return null;
		}
		const item = monitor.getItem() as { tabId?: string } | null;
		return item?.tabId ?? null;
	});

	// While dragging the active tab, render its neighbor (preceding tab, or the
	// next one when dragging the first tab) instead. Dropping a tab onto its own
	// view is a no-op (you'd merge it into itself), so showing a sibling lets
	// you see — and drop onto — an actual merge target.
	const displayedTab = useMemo(() => {
		if (draggedTabId && draggedTabId === activeTabId) {
			const index = tabs.findIndex((t) => t.id === draggedTabId);
			if (index > 0) return tabs[index - 1];
			if (index === 0 && tabs.length > 1) return tabs[1];
		}
		return activeTab;
	}, [draggedTabId, activeTabId, tabs, activeTab]);

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

	return (
		<div
			className={cn(
				"flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground",
				className,
			)}
		>
			<TabBar
				tabs={tabs}
				registry={registry}
				activeTabId={activeTabId}
				onSelectTab={(tabId) => store.getState().setActiveTab(tabId)}
				onCloseTab={closeTab}
				onCloseOtherTabs={async (tabId) => {
					for (const tab of tabs) {
						if (tab.id !== tabId) await closeTab(tab.id);
					}
				}}
				onCloseAllTabs={async () => {
					for (const tab of tabs) {
						await closeTab(tab.id);
					}
				}}
				onRenameTab={(tabId, title) =>
					store.getState().setTabTitleOverride({ tabId, titleOverride: title })
				}
				onReorderTab={(tabId, toIndex) =>
					store.getState().reorderTab({ tabId, toIndex })
				}
				onMovePaneToNewTab={(paneId, toIndex) =>
					store.getState().movePaneToNewTab({ paneId, toIndex })
				}
				renderTabIcon={renderTabIcon}
				renderAddTabMenu={renderAddTabMenu}
				renderTabBarTrailing={renderTabBarTrailing}
				renderTabAccessory={renderTabAccessory}
			/>
			{renderBelowTabBar?.()}
			{displayedTab ? (
				<Tab
					store={store}
					tab={displayedTab}
					registry={registry}
					paneActions={paneActions}
					contextMenuActions={contextMenuActions}
					onSplitResizeDragging={onSplitResizeDragging}
				/>
			) : (
				<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
					{renderEmptyState?.() ?? "No tabs open"}
				</div>
			)}
		</div>
	);
}
