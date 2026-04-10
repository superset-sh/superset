import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { WorkspaceProps } from "../../types";
import { Tab } from "./components/Tab";
import { TabBar } from "./components/TabBar";

export function Workspace<TData>({
	store,
	registry,
	className,
	renderTabAccessory,
	renderTabLabel,
	getTabTitle,
	renderEmptyState,
	renderAddTabMenu,
	renderBelowTabBar,
	onBeforeCloseTab,
	paneActions,
	contextMenuActions,
}: WorkspaceProps<TData>) {
	const tabs = useStore(store, (s) => s.tabs);
	const activeTabId = useStore(store, (s) => s.activeTabId);

	const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(
		() => new Set(activeTabId ? [activeTabId] : []),
	);

	useEffect(() => {
		if (!activeTabId) return;
		setMountedTabIds((prev) => {
			if (prev.has(activeTabId)) return prev;
			const next = new Set(prev);
			next.add(activeTabId);
			return next;
		});
	}, [activeTabId]);

	useEffect(() => {
		setMountedTabIds((prev) => {
			const existing = new Set(tabs.map((t) => t.id));
			let changed = false;
			const next = new Set<string>();
			for (const id of prev) {
				if (existing.has(id)) {
					next.add(id);
				} else {
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [tabs]);

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
				getTabTitle={(tab) => getTabTitle?.(tab) ?? tab.titleOverride ?? tab.id}
				renderTabLabel={renderTabLabel}
				renderAddTabMenu={renderAddTabMenu}
				renderTabAccessory={renderTabAccessory}
			/>
			{renderBelowTabBar?.()}
			<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
				{tabs
					.filter((tab) => mountedTabIds.has(tab.id))
					.map((tab) => {
						const isActive = tab.id === activeTabId;
						return (
							<div
								key={tab.id}
								className={cn(
									"absolute inset-0 flex min-h-0 min-w-0 flex-col",
									!isActive && "pointer-events-none invisible",
								)}
								aria-hidden={!isActive}
							>
								<Tab
									store={store}
									tab={tab}
									registry={registry}
									paneActions={paneActions}
									contextMenuActions={contextMenuActions}
								/>
							</div>
						);
					})}
				{mountedTabIds.size === 0 && (
					<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
						{renderEmptyState?.() ?? "No tabs open"}
					</div>
				)}
			</div>
		</div>
	);
}
