import "react-mosaic-component/react-mosaic-component.css";
import "./mosaic-theme.css";

import { useCallback, useEffect } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
} from "react-mosaic-component";
import { dragDropManager } from "renderer/lib/dnd";
import { useWindowsStore } from "renderer/stores/tabs/store";
import type { Pane, Window } from "renderer/stores/tabs/types";
import {
	cleanLayout,
	extractPaneIdsFromLayout,
	getPaneIdsForWindow,
} from "renderer/stores/tabs/utils";
import { WindowPane } from "./WindowPane";

interface WindowViewProps {
	window: Window;
	panes: Record<string, Pane>;
}

export function WindowView({ window, panes }: WindowViewProps) {
	const updateWindowLayout = useWindowsStore((s) => s.updateWindowLayout);
	const removePane = useWindowsStore((s) => s.removePane);
	const removeWindow = useWindowsStore((s) => s.removeWindow);
	const splitPaneHorizontal = useWindowsStore((s) => s.splitPaneHorizontal);
	const splitPaneVertical = useWindowsStore((s) => s.splitPaneVertical);
	const setFocusedPane = useWindowsStore((s) => s.setFocusedPane);
	const focusedPaneIds = useWindowsStore((s) => s.focusedPaneIds);

	const focusedPaneId = focusedPaneIds[window.id];

	// Get valid pane IDs for this window
	const validPaneIds = new Set(getPaneIdsForWindow(panes, window.id));
	const cleanedLayout = cleanLayout(window.layout, validPaneIds);

	// Auto-remove window when all panes are gone
	useEffect(() => {
		if (!cleanedLayout) {
			removeWindow(window.id);
		}
	}, [cleanedLayout, removeWindow, window.id]);

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			if (!newLayout) {
				// This shouldn't happen as we handle last pane removal in removePane
				return;
			}

			const oldPaneIds = extractPaneIdsFromLayout(window.layout);
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
			updateWindowLayout(window.id, newLayout);
		},
		[window.id, window.layout, updateWindowLayout, removePane],
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
				<WindowPane
					paneId={paneId}
					path={path}
					pane={pane}
					isActive={isActive}
					windowId={window.id}
					workspaceId={window.workspaceId}
					splitPaneHorizontal={splitPaneHorizontal}
					splitPaneVertical={splitPaneVertical}
					removePane={removePane}
					setFocusedPane={setFocusedPane}
				/>
			);
		},
		[
			panes,
			focusedPaneId,
			window.id,
			window.workspaceId,
			splitPaneHorizontal,
			splitPaneVertical,
			removePane,
			setFocusedPane,
		],
	);

	// Window will be removed by useEffect above
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
