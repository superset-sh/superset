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
import { type TabGroup, useTabs } from "renderer/stores";

interface GroupTabViewProps {
	tab: TabGroup;
	focusedChildId?: string | null;
}

export function GroupTabView({ tab, focusedChildId }: GroupTabViewProps) {
	const allTabs = useTabs();
	const childTabs = allTabs.filter((t) => tab.childTabIds.includes(t.id));

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			console.log("Layout changed:", newLayout);
		},
		[],
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
					<div className="w-full h-full bg-red-900">{childTab.title}</div>
				</MosaicWindow>
			);
		},
		[childTabs, focusedChildId],
	);

	if (childTabs.length === 0 || !tab.layout) {
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
				value={tab.layout}
				onChange={handleLayoutChange}
				className="mosaic-theme-dark"
				dragAndDropManager={dragDropManager}
			/>
		</div>
	);
}
