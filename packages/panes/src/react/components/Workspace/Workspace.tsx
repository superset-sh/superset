import { cn } from "@superset/ui/utils";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
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
	onBeforeCloseTab,
	paneActions,
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
		<DndProvider backend={HTML5Backend}>
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
					onCloseOtherTabs={(tabId) => {
						for (const tab of tabs) {
							if (tab.id !== tabId) closeTab(tab.id);
						}
					}}
					onCloseAllTabs={() => {
						for (const tab of tabs) {
							closeTab(tab.id);
						}
					}}
					onRenameTab={(tabId, title) =>
						store
							.getState()
							.setTabTitleOverride({ tabId, titleOverride: title })
					}
					onReorderTab={(tabId, toIndex) =>
						store.getState().reorderTab({ tabId, toIndex })
					}
					getTabTitle={(tab) => tab.titleOverride ?? tab.id}
					renderAddTabMenu={renderAddTabMenu}
					renderTabAccessory={renderTabAccessory}
				/>
				{activeTab ? (
					<Tab
						store={store}
						tab={activeTab}
						registry={registry}
						paneActions={paneActions}
					/>
				) : (
					<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
						{renderEmptyState?.() ?? "No tabs open"}
					</div>
				)}
			</div>
		</DndProvider>
	);
}
