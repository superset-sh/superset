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
	renderBelowTabBar,
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
			{renderBelowTabBar?.()}
			{/* Keyed wrapper so the Tab content's identity is stable across
			    re-renders regardless of what sibling children Workspace
			    introduces via render slots (e.g. renderBelowTabBar). Without
			    this, adding a slot sibling above Tab shifted its positional
			    child index which could trigger spurious remounts during
			    reconciliation and make tab switches flicker. */}
			<div
				key="tab-content"
				className="contents"
			>
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
		</div>
	);
}
