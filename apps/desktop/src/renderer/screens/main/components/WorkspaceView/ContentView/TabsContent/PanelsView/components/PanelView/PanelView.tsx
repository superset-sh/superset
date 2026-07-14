import { cn } from "@superset/ui/utils";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { useDragTabStore } from "renderer/stores/drag-tab-store";
import type { Tab } from "renderer/stores/tabs/types";
import { GroupStrip } from "../../../GroupStrip";
import { TabView } from "../../../TabView";
import { PanelDropOverlay } from "../PanelDropOverlay";

interface PanelViewProps {
	workspaceId: string;
	panelId: string;
	path: MosaicBranch[];
	/** Ordered tabs of this panel */
	tabs: Tab[];
	/** The panel's visible tab */
	activeTab: Tab | null;
}

/**
 * One VS Code-style editor group: a tab strip (toolbar) over the active tab's
 * content, with a drop overlay for tab drags.
 */
export function PanelView({
	workspaceId,
	panelId,
	path,
	tabs,
	activeTab,
}: PanelViewProps) {
	const isTabDragging = useDragTabStore((s) => s.draggingTabId !== null);

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() => (
				<div className="flex h-full w-full items-stretch">
					<GroupStrip
						workspaceId={workspaceId}
						panelId={panelId}
						tabs={tabs}
						activeTabId={activeTab?.id ?? null}
					/>
				</div>
			)}
		>
			<div className="relative h-full w-full overflow-hidden">
				<div
					className={cn(
						"h-full w-full",
						// Let the drop overlay receive events over terminals/webviews
						isTabDragging && "pointer-events-none",
					)}
				>
					{activeTab ? <TabView tab={activeTab} /> : null}
				</div>
				<PanelDropOverlay panelId={panelId} />
			</div>
		</MosaicWindow>
	);
}
