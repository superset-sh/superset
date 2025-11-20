import "react-mosaic-component/react-mosaic-component.css";
import "./mosaic-theme.css";

import { useCallback } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
	MosaicWindow,
} from "react-mosaic-component";
import { dragDropManager } from "renderer/lib/dnd";
import {
	cleanLayout,
	getChildTabIds,
	type TabGroup,
	useActiveTabIds,
	useTabs,
	useTabsStore,
} from "renderer/stores";
import { TabContentContextMenu } from "../TabContentContextMenu";

interface GroupTabViewProps {
	tab: TabGroup;
}

function extractTabIdsFromLayout(
	layout: MosaicNode<string> | null,
): Set<string> {
	const ids = new Set<string>();

	if (!layout) return ids;

	if (typeof layout === "string") {
		ids.add(layout);
	} else {
		const firstIds = extractTabIdsFromLayout(layout.first);
		const secondIds = extractTabIdsFromLayout(layout.second);
		for (const id of firstIds) ids.add(id);
		for (const id of secondIds) ids.add(id);
	}

	return ids;
}

export function GroupTabView({ tab }: GroupTabViewProps) {
	const allTabs = useTabs();
	const childTabIds = getChildTabIds(allTabs, tab.id);
	const childTabs = allTabs.filter((t) => childTabIds.includes(t.id));
	const updateTabGroupLayout = useTabsStore(
		(state) => state.updateTabGroupLayout,
	);
	const removeChildTabFromGroup = useTabsStore(
		(state) => state.removeChildTabFromGroup,
	);
	const activeTabIds = useActiveTabIds();
	const activeTabId = activeTabIds[tab.workspaceId];

	const validTabIds = new Set(childTabIds);
	const cleanedLayout = cleanLayout(tab.layout, validTabIds);

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			const oldTabIds = extractTabIdsFromLayout(tab.layout);
			const newTabIds = extractTabIdsFromLayout(newLayout);

			const removedTabIds = Array.from(oldTabIds).filter(
				(id) => !newTabIds.has(id),
			);

			for (const removedId of removedTabIds) {
				removeChildTabFromGroup(tab.id, removedId);
			}

			if (newLayout) {
				updateTabGroupLayout(tab.id, newLayout);
			}
		},
		[tab.id, tab.layout, updateTabGroupLayout, removeChildTabFromGroup],
	);

	const handleSplitHorizontal = (tabId: string) => {
		// TODO: Implement split horizontally functionality
		console.log("Split horizontally:", tabId);
	};

	const handleSplitVertical = (tabId: string) => {
		// TODO: Implement split vertically functionality
		console.log("Split vertically:", tabId);
	};

	const handleClosePane = (tabId: string) => {
		// TODO: Implement close pane functionality
		console.log("Close pane:", tabId);
	};

	const renderPane = (tabId: string, path: MosaicBranch[]) => {
		const isActive = tabId === activeTabId;
		const childTab = childTabs.find((t) => t.id === tabId);
		if (!childTab) {
			return (
				<div className="w-full h-full flex items-center justify-center text-muted-foreground">
					Tab not found: {tabId}
				</div>
			);
		}

		return (
			<MosaicWindow<string>
				path={path}
				title={childTab.title}
				toolbarControls={<div />}
				className={isActive ? "mosaic-window-focused" : ""}
			>
				<TabContentContextMenu
					onSplitHorizontal={() => handleSplitHorizontal(tabId)}
					onSplitVertical={() => handleSplitVertical(tabId)}
					onClosePane={() => handleClosePane(tabId)}
				>
					<div className="w-full h-full">{childTab.title}</div>
				</TabContentContextMenu>
			</MosaicWindow>
		);
	};

	if (childTabs.length === 0 || !cleanedLayout) {
		return (
			<div className="w-full h-full flex items-center justify-center">
				<div className="text-center">
					<p className="text-muted-foreground">No panes in this group</p>
					<p className="text-xs text-muted-foreground/60 mt-2">
						Create a new pane to get started
					</p>
				</div>
			</div>
		);
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
