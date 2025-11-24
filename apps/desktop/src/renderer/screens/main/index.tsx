import { DndProvider } from "react-dnd";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { useAgentHookListener } from "renderer/stores/tabs";
import { useSplitActiveTab } from "renderer/react-query/tabs";
import { dragDropManager } from "../../lib/dnd";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { TopBar } from "./components/TopBar";
import { WorkspaceView } from "./components/WorkspaceView";

export function MainScreen() {
	const { toggleSidebar } = useSidebarStore();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const splitActiveTabMutation = useSplitActiveTab();

	// Listen for agent completion hooks from main process
	useAgentHookListener();

	// Sidebar toggle shortcut
	useHotkeys("meta+s", toggleSidebar, [toggleSidebar]);

	// Split view shortcuts
	useHotkeys(
		"meta+d",
		() => {
			if (activeWorkspace?.id) {
				splitActiveTabMutation.mutate({
					workspaceId: activeWorkspace.id,
					direction: "row", // Vertical split
				});
			}
		},
		[activeWorkspace?.id, splitActiveTabMutation],
	);

	useHotkeys(
		"meta+shift+d",
		() => {
			if (activeWorkspace?.id) {
				splitActiveTabMutation.mutate({
					workspaceId: activeWorkspace.id,
					direction: "column", // Horizontal split
				});
			}
		},
		[activeWorkspace?.id, splitActiveTabMutation],
	);

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
