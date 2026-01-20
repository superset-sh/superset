import {
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	SidebarMode,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { ResizablePanel } from "../../ResizablePanel";
import { ChangesContent } from "../ChangesContent";
import { ContentView } from "../ContentView";
import { Sidebar } from "../Sidebar";

export function WorkspaceLayout() {
	const {
		isSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		isResizing,
		setIsResizing,
		currentMode,
	} = useSidebarStore();

	const isExpanded = currentMode === SidebarMode.Changes;

	return (
		<>
			<div className="flex-1 min-w-0 overflow-hidden">
				{isExpanded ? <ChangesContent /> : <ContentView />}
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
				>
					<Sidebar />
				</ResizablePanel>
			)}
		</>
	);
}
