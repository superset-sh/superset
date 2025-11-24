import { DndProvider } from "react-dnd";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import {
	useAgentHookListener,
	useSplitTabHorizontal,
	useSplitTabVertical,
} from "renderer/stores/tabs";
import { dragDropManager } from "../../lib/dnd";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { TopBar } from "./components/TopBar";
import { WorkspaceView } from "./components/WorkspaceView";

export function MainScreen() {
	const { toggleSidebar } = useSidebarStore();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const splitTabVertical = useSplitTabVertical();
	const splitTabHorizontal = useSplitTabHorizontal();

	// Listen for agent completion hooks from main process
	useAgentHookListener();

	const activeWorkspaceId = activeWorkspace?.id;

	// Sidebar toggle shortcut
	useHotkeys("meta+s", toggleSidebar, [toggleSidebar]);

	// Split view shortcuts
	useHotkeys("meta+d", () => {
		if (activeWorkspaceId) {
			splitTabVertical(activeWorkspaceId);
		}
	}, [activeWorkspaceId, splitTabVertical]);

	useHotkeys("meta+shift+d", () => {
		if (activeWorkspaceId) {
			splitTabHorizontal(activeWorkspaceId);
		}
	}, [activeWorkspaceId, splitTabHorizontal]);

	return (
		<DndProvider manager={dragDropManager}>
			<Background />
			<AppFrame>
				<div className="flex flex-col h-full w-full">
					<TopBar />
					<div className="flex flex-1 overflow-hidden">
						<WorkspaceView />
					</div>
				</div>
			</AppFrame>
		</DndProvider>
	);
}
