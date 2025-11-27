import { DndProvider } from "react-dnd";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useCurrentView } from "renderer/stores/app-state";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import {
	useAgentHookListener,
	useSplitTabHorizontal,
	useSplitTabVertical,
} from "renderer/stores/tabs";
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

	// Listen for agent completion hooks from main process
	useAgentHookListener();

	const activeWorkspaceId = activeWorkspace?.id;
	const isWorkspaceView = currentView === "workspace";

	// Sidebar toggle shortcut - only in workspace view
	useHotkeys("meta+s", () => {
		if (isWorkspaceView) toggleSidebar();
	}, [toggleSidebar, isWorkspaceView]);

	// Split view shortcuts - only in workspace view
	useHotkeys("meta+d", () => {
		if (isWorkspaceView && activeWorkspaceId) {
			splitTabVertical(activeWorkspaceId);
		}
	}, [activeWorkspaceId, splitTabVertical, isWorkspaceView]);

	useHotkeys("meta+shift+d", () => {
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
		</DndProvider>
	);
}
