import { useState } from "react";
import { DndProvider } from "react-dnd";
import { useHotkeys } from "react-hotkeys-hook";
import { HotkeyModal } from "renderer/components/HotkeyModal";
import { trpc } from "renderer/lib/trpc";
import { useCurrentView } from "renderer/stores/app-state";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import {
	useAgentHookListener,
	useSplitTabHorizontal,
	useSplitTabVertical,
} from "renderer/stores/tabs";
import { HOTKEYS } from "shared/hotkeys";
import { dragDropManager } from "../../lib/dnd";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { SettingsView } from "./components/SettingsView";
import { TopBar } from "./components/TopBar";
import { WorkspaceView } from "./components/WorkspaceView";

export function MainScreen() {
	const currentView = useCurrentView();
	const { toggleSidebar } = useSidebarStore();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const splitTabVertical = useSplitTabVertical();
	const splitTabHorizontal = useSplitTabHorizontal();
	const [hotkeyModalOpen, setHotkeyModalOpen] = useState(false);

	// Listen for agent completion hooks from main process
	useAgentHookListener();

	const activeWorkspaceId = activeWorkspace?.id;
	const isWorkspaceView = currentView === "workspace";

	// Register global shortcuts
	useHotkeys(HOTKEYS.SHOW_HOTKEYS.keys, () => setHotkeyModalOpen(true), []);

	useHotkeys(HOTKEYS.TOGGLE_SIDEBAR.keys, () => {
		if (isWorkspaceView) toggleSidebar();
	}, [toggleSidebar, isWorkspaceView]);

	useHotkeys(HOTKEYS.SPLIT_HORIZONTAL.keys, () => {
		if (isWorkspaceView && activeWorkspaceId) {
			splitTabVertical(activeWorkspaceId);
		}
	}, [activeWorkspaceId, splitTabVertical, isWorkspaceView]);

	useHotkeys(HOTKEYS.SPLIT_VERTICAL.keys, () => {
		if (isWorkspaceView && activeWorkspaceId) {
			splitTabHorizontal(activeWorkspaceId);
		}
	}, [activeWorkspaceId, splitTabHorizontal, isWorkspaceView]);

	return (
		<DndProvider manager={dragDropManager}>
			<Background />
			<AppFrame>
				<div className="flex flex-col h-full w-full">
					<TopBar />
					<div className="flex flex-1 overflow-hidden">
						{currentView === "settings" ? <SettingsView /> : <WorkspaceView />}
					</div>
				</div>
			</AppFrame>
			<HotkeyModal open={hotkeyModalOpen} onOpenChange={setHotkeyModalOpen} />
		</DndProvider>
	);
}
