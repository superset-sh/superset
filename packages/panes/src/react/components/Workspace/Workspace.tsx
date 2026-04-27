import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { Pane } from "../../../types";
import type { WorkspaceProps } from "../../types";
import { Tab } from "./components/Tab";
import { TabBar } from "./components/TabBar";
import { useWorkspaceInteractionState } from "./hooks/useWorkspaceInteractionState";
import { resolveTabTitle } from "./utils/resolveTabTitle";

export function Workspace<TData>({
	store,
	registry,
	className,
	renderTabAccessory,
	renderTabIcon,
	renderEmptyState,
	renderAddTabMenu,
	renderBelowTabBar,
	onBeforeCloseTab,
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
				registry[prevPane.kind]?.onRemoved?.(prevPane);
			}
		}
		previousPanesRef.current = current;
	}, [tabs, registry]);

	const closeTab = async (tabId: string) => {
		if (onBeforeCloseTab) {
			const tab = store.getState().getTab(tabId);
			if (!tab) return;
			const allowed = await onBeforeCloseTab(tab);
			if (!allowed) return;
		}
		store.getState().removeTab(tabId);
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
				getTabTitle={(tab) => resolveTabTitle(tab, tabs, registry)}
				renderTabIcon={renderTabIcon}
				renderAddTabMenu={renderAddTabMenu}
				renderTabAccessory={renderTabAccessory}
			/>
			{renderBelowTabBar?.()}
			{activeTab ? (
				<Tab
					store={store}
					tab={activeTab}
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
