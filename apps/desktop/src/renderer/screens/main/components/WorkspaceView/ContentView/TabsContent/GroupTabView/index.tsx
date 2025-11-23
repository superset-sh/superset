import "react-mosaic-component/react-mosaic-component.css";
import "./mosaic-theme.css";

import { useCallback } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
} from "react-mosaic-component";
import type { Tab } from "main/lib/trpc/routers/tabs";
import { dragDropManager } from "renderer/lib/dnd";
import { trpc } from "renderer/lib/trpc";
import { useUpdateLayout, useSplit } from "renderer/react-query/tabs";
import { GroupTabPane } from "./GroupTabPane";

interface GroupTabViewProps {
	tab: Tab & { type: "group" };
}

// Helper to clean layout - remove tab IDs that don't exist
function cleanLayout(
	layout: MosaicNode<string> | null | undefined,
	validTabIds: Set<string>,
): MosaicNode<string> | null {
	if (!layout) return null;

	if (typeof layout === "string") {
		return validTabIds.has(layout) ? layout : null;
	}

	const cleanedFirst = cleanLayout(layout.first, validTabIds);
	const cleanedSecond = cleanLayout(layout.second, validTabIds);

	if (!cleanedFirst && !cleanedSecond) return null;
	if (!cleanedFirst) return cleanedSecond;
	if (!cleanedSecond) return cleanedFirst;

	return {
		...layout,
		first: cleanedFirst,
		second: cleanedSecond,
	};
}

export function GroupTabView({ tab }: GroupTabViewProps) {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: allTabs = [] } = trpc.tabs.getByWorkspace.useQuery(
		{ workspaceId: tab.workspaceId },
		{ enabled: !!tab.workspaceId },
	);
	const updateLayoutMutation = useUpdateLayout();
	const splitMutation = useSplit();

	const childTabs = allTabs.filter((t) => t.parentId === tab.id);
	const validTabIds = new Set(childTabs.map((t) => t.id));
	const cleanedLayout = cleanLayout(tab.layout, validTabIds);

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			// Just call the backend - it handles everything:
			// - Extracting old/new tab IDs
			// - Removing orphaned tabs
			// - Killing terminals
			// - Updating activeTabId if needed
			updateLayoutMutation.mutate({
				groupId: tab.id,
				layout: newLayout,
			});
		},
		[tab.id, updateLayoutMutation],
	);

	const handleSplitHorizontal = (
		sourceTabId?: string,
		path?: MosaicBranch[],
	) => {
		if (sourceTabId && path) {
			splitMutation.mutate({
				tabId: sourceTabId,
				direction: "column", // Horizontal split = column direction
				path,
			});
		}
	};

	const handleSplitVertical = (sourceTabId?: string, path?: MosaicBranch[]) => {
		if (sourceTabId && path) {
			splitMutation.mutate({
				tabId: sourceTabId,
				direction: "row", // Vertical split = row direction
				path,
			});
		}
	};

	const handleRemoveChild = (groupId: string, tabId: string) => {
		// The Mosaic onChange will handle this automatically when user closes a pane
		// But we can also call updateLayout directly if needed
		console.log("Remove child will be handled by Mosaic onChange", {
			groupId,
			tabId,
		});
	};

	const renderPane = (tabId: string, path: MosaicBranch[]) => {
		const isActive = tabId === activeWorkspace?.activeTabId;
		const childTab = childTabs.find((t) => t.id === tabId);

		if (!childTab || childTab.type !== "terminal") {
			return (
				<div className="w-full h-full flex items-center justify-center text-muted-foreground">
					Tab not found: {tabId}
				</div>
			);
		}

		return (
			<GroupTabPane
				path={path}
				childTab={childTab}
				isActive={isActive}
				groupId={tab.id}
				splitTabHorizontal={handleSplitHorizontal}
				splitTabVertical={handleSplitVertical}
				removeChildTabFromGroup={handleRemoveChild}
			/>
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
