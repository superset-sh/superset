import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useChatPanelStore, useSidebarStore } from "renderer/stores";
import {
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
} from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ResizablePanel } from "../../../ResizablePanel";
import { Sidebar } from "../../Sidebar";
import { ChatPanel } from "./ChatPanel";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

const MIN_CHAT_PANEL_WIDTH = 240;
const MAX_CHAT_PANEL_WIDTH = 480;
const DEFAULT_CHAT_PANEL_WIDTH = 320;

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	const {
		isSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		isResizing,
		setIsResizing,
	} = useSidebarStore();

	const {
		isOpen: isChatPanelOpen,
		size: chatPanelSize,
		setSize: setChatPanelSize,
	} = useChatPanelStore();

	// Convert percentage to pixel width for the ResizablePanel
	const chatPanelWidth =
		chatPanelSize > 0
			? Math.max(
					MIN_CHAT_PANEL_WIDTH,
					Math.min(MAX_CHAT_PANEL_WIDTH, DEFAULT_CHAT_PANEL_WIDTH),
				)
			: DEFAULT_CHAT_PANEL_WIDTH;

	const tabToRender = useMemo(() => {
		if (!activeWorkspaceId) return null;
		const activeTabId = activeTabIds[activeWorkspaceId];
		if (!activeTabId) return null;

		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			<div className="flex-1 min-w-0 overflow-hidden">
				{tabToRender ? <TabView tab={tabToRender} /> : <EmptyTabView />}
			</div>
			{isChatPanelOpen && (
				<ResizablePanel
					width={chatPanelWidth}
					onWidthChange={(width) => {
						// Store as percentage-like value for persistence
						setChatPanelSize(
							Math.round((width / DEFAULT_CHAT_PANEL_WIDTH) * 30),
						);
					}}
					isResizing={false}
					onResizingChange={() => {}}
					minWidth={MIN_CHAT_PANEL_WIDTH}
					maxWidth={MAX_CHAT_PANEL_WIDTH}
					handleSide="left"
				>
					<ChatPanel />
				</ResizablePanel>
			)}
			{isSidebarOpen && (
				<ResizablePanel
					width={sidebarWidth}
					onWidthChange={setSidebarWidth}
					isResizing={isResizing}
					onResizingChange={setIsResizing}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					handleSide="left"
				>
					<Sidebar />
				</ResizablePanel>
			)}
		</div>
	);
}
