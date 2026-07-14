import type { Tab as TabType } from "../../../../../../../types";
import { Tab } from "../../../Tab";
import { TabBar } from "../../../TabBar";
import type { PanelsContext } from "../../types";
import { PanelDropZone } from "../PanelDropZone";
import { PanelExpandToggle } from "../PanelExpandToggle";

interface PanelSectionProps<TData> {
	panelId: string;
	context: PanelsContext<TData>;
}

/**
 * One VS Code-style editor group: its own tab bar over the active tab's
 * content, with a drop zone for tab drags.
 */
export function PanelSection<TData>({
	panelId,
	context,
}: PanelSectionProps<TData>) {
	const { store, derived, tabsById } = context;

	const tabIds = derived.tabIdsByPanel[panelId] ?? [];
	const panelTabs = tabIds
		.map((id) => tabsById.get(id))
		.filter((tab): tab is TabType<TData> => tab !== undefined);
	const activeTabId = derived.activeTabIdByPanel[panelId] ?? null;
	const activeTab = activeTabId ? (tabsById.get(activeTabId) ?? null) : null;

	// Interacting with a panel's bar selects the panel (VS Code: focusing a
	// group), so panel-relative actions (new tab, presets) target it.
	const selectPanel = () => {
		if (activeTabId && store.getState().activeTabId !== activeTabId) {
			store.getState().setActiveTab(activeTabId);
		}
	};

	// Expand toggle only makes sense with multiple panels; workspace-level
	// trailing controls render once, in the top-right panel's bar.
	const showExpandToggle = derived.panelIds.length > 1;
	const workspaceTrailing =
		panelId === context.topRightPanelId
			? context.renderTabBarTrailing
			: undefined;
	const renderTrailing =
		showExpandToggle || workspaceTrailing
			? () => (
					<>
						{showExpandToggle && (
							<PanelExpandToggle
								store={store}
								panelId={panelId}
								layout={derived.layout}
							/>
						)}
						{workspaceTrailing?.()}
					</>
				)
			: undefined;

	return (
		<div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden">
			<TabBar
				tabs={panelTabs}
				registry={context.registry}
				activeTabId={activeTabId}
				onSelectTab={(tabId) => store.getState().setActiveTab(tabId)}
				onCloseTab={context.closeTab}
				onCloseOtherTabs={async (tabId) => {
					for (const tab of panelTabs) {
						if (tab.id !== tabId) await context.closeTab(tab.id);
					}
				}}
				onCloseAllTabs={async () => {
					for (const tab of panelTabs) {
						await context.closeTab(tab.id);
					}
				}}
				onRenameTab={(tabId, title) =>
					store.getState().setTabTitleOverride({ tabId, titleOverride: title })
				}
				onReorderTab={(tabId, toIndex) =>
					store.getState().moveTabToPanel({
						tabId,
						targetPanelId: panelId,
						toIndex,
					})
				}
				onMovePaneToNewTab={(paneId, toIndex) =>
					store.getState().movePaneToNewTab({ paneId, toIndex, panelId })
				}
				onBarMouseDown={selectPanel}
				onBarDoubleClick={() => store.getState().equalizePanels()}
				renderTabIcon={context.renderTabIcon}
				renderAddTabMenu={
					context.renderAddTabMenu
						? () => context.renderAddTabMenu?.({ panelId })
						: undefined
				}
				renderTabBarTrailing={renderTrailing}
				renderTabAccessory={context.renderTabAccessory}
			/>
			<div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{activeTab ? (
					<Tab
						store={store}
						tab={activeTab}
						registry={context.registry}
						paneActions={context.paneActions}
						contextMenuActions={context.contextMenuActions}
						onSplitResizeDragging={context.onSplitResizeDragging}
					/>
				) : (
					<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
						{context.renderEmptyState?.() ?? "No tabs open"}
					</div>
				)}
				<PanelDropZone store={store} panelId={panelId} />
			</div>
		</div>
	);
}
