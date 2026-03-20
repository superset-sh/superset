import type { ExternalApp } from "@superset/local-db";
import {
	DEFAULT_SIDEBAR_WIDTH,
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	RightSidebarTab,
	SidebarMode,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { ResizablePanel } from "../../ResizablePanel";
import { ChangesContent, ScrollProvider } from "../ChangesContent";
import { ContentView } from "../ContentView";
import { useBrowserLifecycle } from "../hooks/useBrowserLifecycle";
import { RightSidebar } from "../RightSidebar";

interface WorkspaceLayoutProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

export function WorkspaceLayout({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: WorkspaceLayoutProps) {
	useBrowserLifecycle();
	const isLeftPanelOpen = useSidebarStore((s) => s.isLeftPanelOpen);
	const isRightPanelOpen = useSidebarStore((s) => s.isRightPanelOpen);
	const sidebarWidth = useSidebarStore((s) => s.sidebarWidth);
	const setSidebarWidth = useSidebarStore((s) => s.setSidebarWidth);
	const leftPanelWidth = useSidebarStore((s) => s.leftPanelWidth);
	const setLeftPanelWidth = useSidebarStore((s) => s.setLeftPanelWidth);
	const isResizing = useSidebarStore((s) => s.isResizing);
	const setIsResizing = useSidebarStore((s) => s.setIsResizing);
	const currentMode = useSidebarStore((s) => s.currentMode);
	const tabPositions = useSidebarStore((s) => s.tabPositions);

	const isExpanded = currentMode === SidebarMode.Changes;

	// Determine which tabs are on which side
	const hasLeftTabs =
		tabPositions[RightSidebarTab.Changes] === "left" ||
		tabPositions[RightSidebarTab.Files] === "left";
	const hasRightTabs =
		tabPositions[RightSidebarTab.Changes] === "right" ||
		tabPositions[RightSidebarTab.Files] === "right";

	const showLeftPanel = isLeftPanelOpen && hasLeftTabs;
	const showRightPanel = isRightPanelOpen && hasRightTabs;

	return (
		<ScrollProvider>
			{showLeftPanel && (
				<ResizablePanel
					width={leftPanelWidth}
					onWidthChange={setLeftPanelWidth}
					isResizing={isResizing}
					onResizingChange={setIsResizing}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					handleSide="right"
					onDoubleClickHandle={() => setLeftPanelWidth(DEFAULT_SIDEBAR_WIDTH)}
				>
					<RightSidebar side="left" />
				</ResizablePanel>
			)}
			<div className="flex-1 min-w-0 overflow-hidden">
				{isExpanded ? (
					<ChangesContent />
				) : (
					<ContentView
						defaultExternalApp={defaultExternalApp}
						onOpenInApp={onOpenInApp}
						onOpenQuickOpen={onOpenQuickOpen}
					/>
				)}
			</div>
			{showRightPanel && (
				<ResizablePanel
					width={sidebarWidth}
					onWidthChange={setSidebarWidth}
					isResizing={isResizing}
					onResizingChange={setIsResizing}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					handleSide="left"
					className={isExpanded ? "border-l-0" : undefined}
					onDoubleClickHandle={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
				>
					<RightSidebar side="right" />
				</ResizablePanel>
			)}
		</ScrollProvider>
	);
}
