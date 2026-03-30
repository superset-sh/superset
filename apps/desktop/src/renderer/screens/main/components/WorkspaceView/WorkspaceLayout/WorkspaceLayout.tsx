import type { ExternalApp } from "@superset/local-db";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DEFAULT_SIDEBAR_WIDTH,
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	SidebarMode,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { DEFAULT_SWAP_PANELS } from "shared/constants";
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
	const isSidebarOpen = useSidebarStore((s) => s.isSidebarOpen);
	const sidebarWidth = useSidebarStore((s) => s.sidebarWidth);
	const setSidebarWidth = useSidebarStore((s) => s.setSidebarWidth);
	const isResizing = useSidebarStore((s) => s.isResizing);
	const setIsResizing = useSidebarStore((s) => s.setIsResizing);
	const currentMode = useSidebarStore((s) => s.currentMode);

	const { data: swapPanels } = electronTrpc.settings.getSwapPanels.useQuery();
	const isSwapped = swapPanels ?? DEFAULT_SWAP_PANELS;

	const isExpanded = currentMode === SidebarMode.Changes;

	const sidebarPanel = isSidebarOpen && (
		<ResizablePanel
			width={sidebarWidth}
			onWidthChange={setSidebarWidth}
			isResizing={isResizing}
			onResizingChange={setIsResizing}
			minWidth={MIN_SIDEBAR_WIDTH}
			maxWidth={MAX_SIDEBAR_WIDTH}
			handleSide={isSwapped ? "right" : "left"}
			className={isExpanded ? (isSwapped ? "border-r-0" : "border-l-0") : undefined}
			onDoubleClickHandle={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
		>
			<RightSidebar />
		</ResizablePanel>
	);

	return (
		<ScrollProvider>
			{isSwapped && sidebarPanel}
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
			{!isSwapped && sidebarPanel}
		</ScrollProvider>
	);
}
