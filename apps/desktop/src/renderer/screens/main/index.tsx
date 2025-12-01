import { DndProvider } from "react-dnd";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useCurrentView, useOpenSettings } from "renderer/stores/app-state";
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
import { StartView } from "./components/StartView";
import { TopBar } from "./components/TopBar";
import { WorkspaceView } from "./components/WorkspaceView";

export function MainScreen() {
	const currentView = useCurrentView();
	const openSettings = useOpenSettings();
	const { toggleSidebar } = useSidebarStore();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const splitTabVertical = useSplitTabVertical();
	const splitTabHorizontal = useSplitTabHorizontal();

	// Listen for agent completion hooks from main process
	useAgentHookListener();

	const activeWorkspaceId = activeWorkspace?.id;
	const isWorkspaceView = currentView === "workspace";

	// Register global shortcuts
	useHotkeys(HOTKEYS.SHOW_HOTKEYS.keys, () => openSettings("keyboard"), [
		openSettings,
	]);

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

	const showStartView = !activeWorkspace && currentView !== "settings";

	// Determine which content view to show
	const renderContent = () => {
		if (currentView === "settings") {
			return <SettingsView />;
		}
		return <WorkspaceView />;
	};

	return (
		<DndProvider manager={dragDropManager}>
			<Background />
			<AppFrame>
				{showStartView ? (
					<StartView />
				) : (
					<div className="flex flex-col h-full w-full">
						<TopBar />
						<div className="flex flex-1 overflow-hidden">{renderContent()}</div>
					</div>
				)}
			</AppFrame>
		</DndProvider>
	);
}
