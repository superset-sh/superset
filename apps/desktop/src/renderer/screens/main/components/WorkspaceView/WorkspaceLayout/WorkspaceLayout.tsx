import type { ExternalApp } from "@superset/local-db";
import {
	DEFAULT_SIDEBAR_WIDTH,
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
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
	const isSidebarOpen = useSidebarStore((s) => s.isSidebarOpen);
	const sidebarWidth = useSidebarStore((s) => s.sidebarWidth);
	const setSidebarWidth = useSidebarStore((s) => s.setSidebarWidth);
	const isResizing = useSidebarStore((s) => s.isResizing);
	const setIsResizing = useSidebarStore((s) => s.setIsResizing);
	const currentMode = useSidebarStore((s) => s.currentMode);

	const isExpanded = currentMode === SidebarMode.Changes;

	return (
		<ScrollProvider>
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
			{isSidebarOpen && (
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
					<RightSidebar />
				</ResizablePanel>
			)}
		</ScrollProvider>
	);
}
