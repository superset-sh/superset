import "react-mosaic-component/react-mosaic-component.css";
import "./mosaic-theme.css";

import { useCallback, useEffect } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
} from "react-mosaic-component";
import { dragDropManager } from "renderer/lib/dnd";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import {
	cleanLayout,
	extractPaneIdsFromLayout,
	getPaneIdsForTab,
} from "renderer/stores/tabs/utils";
import { TabPane } from "./TabPane";

interface TabViewProps {
	tab: Tab;
	panes: Record<string, Pane>;
}

export function TabView({ tab, panes }: TabViewProps) {
	const updateTabLayout = useTabsStore((s) => s.updateTabLayout);
	const removePane = useTabsStore((s) => s.removePane);
	const removeTab = useTabsStore((s) => s.removeTab);
	const splitPaneAuto = useTabsStore((s) => s.splitPaneAuto);
	const splitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const splitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const movePaneToTab = useTabsStore((s) => s.movePaneToTab);
	const movePaneToNewTab = useTabsStore((s) => s.movePaneToNewTab);
	const allTabs = useTabsStore((s) => s.tabs);

	// Get tabs in the same workspace for move targets
	const workspaceTabs = allTabs.filter(
		(t) => t.workspaceId === tab.workspaceId,
	);

	const focusedPaneId = focusedPaneIds[tab.id];

	// Get valid pane IDs for this tab
	const validPaneIds = new Set(getPaneIdsForTab(panes, tab.id));
	const cleanedLayout = cleanLayout(tab.layout, validPaneIds);

	// Auto-remove tab when all panes are gone
	useEffect(() => {
		if (!cleanedLayout) {
			removeTab(tab.id);
		}
	}, [cleanedLayout, removeTab, tab.id]);

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			if (!newLayout) {
				// This shouldn't happen as we handle last pane removal in removePane
				return;
			}

			const oldPaneIds = extractPaneIdsFromLayout(tab.layout);
			const newPaneIds = extractPaneIdsFromLayout(newLayout);

			// Find removed panes (e.g., from Mosaic close button)
			const removedPaneIds = oldPaneIds.filter(
				(id) => !newPaneIds.includes(id),
			);

			// Remove panes that were removed via Mosaic UI
			for (const removedId of removedPaneIds) {
				removePane(removedId);
			}

			// Update the layout
			updateTabLayout(tab.id, newLayout);
		},
		[tab.id, tab.layout, updateTabLayout, removePane],
	);

	const renderPane = useCallback(
		(paneId: string, path: MosaicBranch[]) => {
			const pane = panes[paneId];
			const isActive = paneId === focusedPaneId;

			if (!pane) {
				return (
					<div className="w-full h-full flex items-center justify-center text-muted-foreground">
						Pane not found: {paneId}
					</div>
				);
			}

			return (
				<TabPane
					paneId={paneId}
					path={path}
					pane={pane}
					isActive={isActive}
					tabId={tab.id}
					workspaceId={tab.workspaceId}
					splitPaneAuto={splitPaneAuto}
					splitPaneHorizontal={splitPaneHorizontal}
					splitPaneVertical={splitPaneVertical}
					removePane={removePane}
					setFocusedPane={setFocusedPane}
					availableTabs={workspaceTabs}
					onMoveToTab={(targetTabId) => movePaneToTab(paneId, targetTabId)}
					onMoveToNewTab={() => movePaneToNewTab(paneId)}
				/>
			);
		},
		[
			panes,
			focusedPaneId,
			tab.id,
			tab.workspaceId,
			splitPaneAuto,
			splitPaneHorizontal,
			splitPaneVertical,
			removePane,
			setFocusedPane,
			workspaceTabs,
			movePaneToTab,
			movePaneToNewTab,
		],
	);

	// Tab will be removed by useEffect above
	if (!cleanedLayout) {
		return null;
	}

	return (
		<div className="w-full h-full mosaic-container">
			<Mosaic<string>
				renderTile={renderPane}
				value={cleanedLayout}
				onChange={handleLayoutChange}
				className="mosaic-theme-dark"
				dragAndDropManager={dragDropManager}
			/>
		</div>
	);
}
