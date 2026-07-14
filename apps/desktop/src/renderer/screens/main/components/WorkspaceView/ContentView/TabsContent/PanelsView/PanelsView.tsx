import "react-mosaic-component/react-mosaic-component.css";
import "./panels-mosaic.css";

import { useCallback, useMemo } from "react";
import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import { Mosaic } from "react-mosaic-component";
import { dragDropManager } from "renderer/lib/dnd";
import { deriveWorkspacePanels } from "renderer/stores/tabs/actions/panels";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { PanelView } from "./components/PanelView";

export const PANELS_MOSAIC_ID = "superset-panels";

interface PanelsViewProps {
	workspaceId: string;
}

/**
 * VS Code-style editor group layout: a resizable mosaic of panels, each with
 * its own tab strip and content. Returns null when the workspace has no tabs
 * (parent renders the empty state).
 */
export function PanelsView({ workspaceId }: PanelsViewProps) {
	const tabs = useTabsStore((s) => s.tabs);
	const panelLayouts = useTabsStore((s) => s.panelLayouts);
	const panelActiveTabIds = useTabsStore((s) => s.panelActiveTabIds);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);
	const updatePanelLayout = useTabsStore((s) => s.updatePanelLayout);

	const derived = useMemo(
		() =>
			deriveWorkspacePanels(
				{
					tabs,
					panelLayouts,
					panelActiveTabIds,
					activeTabIds,
					tabHistoryStacks,
				},
				workspaceId,
			),
		[
			tabs,
			panelLayouts,
			panelActiveTabIds,
			activeTabIds,
			tabHistoryStacks,
			workspaceId,
		],
	);

	const tabsById = useMemo(() => {
		const map = new Map<string, Tab>();
		for (const tab of tabs) {
			map.set(tab.id, tab);
		}
		return map;
	}, [tabs]);

	const handleChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			if (!newLayout) return;
			updatePanelLayout(workspaceId, newLayout);
		},
		[workspaceId, updatePanelLayout],
	);

	const renderPanel = useCallback(
		(panelId: string, path: MosaicBranch[]) => {
			const tabIds = derived.tabIdsByPanel[panelId] ?? [];
			const panelTabs = tabIds
				.map((id) => tabsById.get(id))
				.filter((tab): tab is Tab => tab !== undefined);
			const activeTabId = derived.activeTabIdByPanel[panelId];
			const activeTab = activeTabId
				? (tabsById.get(activeTabId) ?? null)
				: null;

			return (
				<PanelView
					workspaceId={workspaceId}
					panelId={panelId}
					path={path}
					tabs={panelTabs}
					activeTab={activeTab}
				/>
			);
		},
		[derived, tabsById, workspaceId],
	);

	if (!derived.layout) {
		return null;
	}

	return (
		<div className="relative h-full w-full">
			<Mosaic<string>
				mosaicId={PANELS_MOSAIC_ID}
				className="panels-mosaic-tree"
				renderTile={renderPanel}
				value={derived.layout}
				onChange={handleChange}
				dragAndDropManager={dragDropManager}
			/>
		</div>
	);
}
