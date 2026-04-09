import { cn } from "@superset/ui/utils";
import { useStore } from "zustand";
import type { WorkspaceProps } from "../../types";
import { Tab } from "./components/Tab";
import { TabBar } from "./components/TabBar";

export function Workspace<TData>({
	store,
	registry,
	className,
	renderTabAccessory,
	renderEmptyState,
	renderAddTabMenu,
	// TEMP: unused while renderBelowTabBar?.() is commented out below.
	// Rename to _renderBelowTabBar so Biome doesn't warn during the test.
	renderBelowTabBar: _renderBelowTabBar,
	onBeforeCloseTab,
	paneActions,
	contextMenuActions,
}: WorkspaceProps<TData>) {
	const tabs = useStore(store, (s) => s.tabs);
	const activeTabId = useStore(store, (s) => s.activeTabId);
	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

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
				getTabTitle={(tab) => tab.titleOverride ?? tab.id}
				renderAddTabMenu={renderAddTabMenu}
				renderTabAccessory={renderTabAccessory}
			/>
			{/* TEMP: commented out to test whether the renderBelowTabBar slot
			    is what's causing tab-switch flicker. If flicker disappears
			    with this commented out, my Workspace.tsx change is the
			    culprit and we need to move V2PresetsBar outside Workspace.
			    If flicker persists, the root cause is pre-existing v2
			    architecture (terminalRuntimeRegistry detach/attach on
			    every tab switch) and has nothing to do with the preset bar. */}
			{/* {renderBelowTabBar?.()} */}
			{activeTab ? (
				<Tab
					store={store}
					tab={activeTab}
					registry={registry}
					paneActions={paneActions}
					contextMenuActions={contextMenuActions}
				/>
			) : (
				<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
					{renderEmptyState?.() ?? "No tabs open"}
				</div>
			)}
		</div>
	);
}
