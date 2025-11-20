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
	useTabs,
	useTabsStore,
} from "renderer/stores";

interface GroupTabViewProps {
	tab: TabGroup;
	focusedChildId?: string | null;
}

// Extract all tab IDs from a mosaic layout tree
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

export function GroupTabView({ tab, focusedChildId }: GroupTabViewProps) {
	const allTabs = useTabs();
	const childTabIds = getChildTabIds(allTabs, tab.id);
	const childTabs = allTabs.filter((t) => childTabIds.includes(t.id));
	const updateTabGroupLayout = useTabsStore(
		(state) => state.updateTabGroupLayout,
	);
	const removeChildTabFromGroup = useTabsStore(
		(state) => state.removeChildTabFromGroup,
	);

	// Clean the layout to only include tabs that currently exist as children
	const validTabIds = new Set(childTabIds);
	const cleanedLayout = cleanLayout(tab.layout, validTabIds);

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			// Extract tab IDs from old and new layouts to detect removals
			const oldTabIds = extractTabIdsFromLayout(tab.layout);
			const newTabIds = extractTabIdsFromLayout(newLayout);

			// Find tabs that were removed from the layout
			const removedTabIds = Array.from(oldTabIds).filter(
				(id) => !newTabIds.has(id),
			);

			// Remove tabs that were closed in the mosaic
			for (const removedId of removedTabIds) {
				removeChildTabFromGroup(tab.id, removedId);
			}

			// Update layout only if there are still tabs remaining
			if (newLayout) {
				updateTabGroupLayout(tab.id, newLayout);
			}
		},
		[tab.id, tab.layout, updateTabGroupLayout, removeChildTabFromGroup],
	);

	const renderPane = useCallback(
		(tabId: string, path: MosaicBranch[]) => {
			const childTab = childTabs.find((t) => t.id === tabId);

			if (!childTab) {
				return (
					<div className="w-full h-full flex items-center justify-center text-muted-foreground">
						Tab not found: {tabId}
					</div>
				);
			}

			const isFocused = tabId === focusedChildId;

			return (
				<MosaicWindow<string>
					path={path}
					title={childTab.title}
					toolbarControls={<div />}
					className={isFocused ? "mosaic-window-focused" : ""}
				>
					<div className="w-full h-full">{childTab.title}</div>
				</MosaicWindow>
			);
		},
		[childTabs, focusedChildId],
	);

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
