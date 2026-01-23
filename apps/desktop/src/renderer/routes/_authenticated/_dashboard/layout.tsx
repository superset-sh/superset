import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { TopBar } from "renderer/screens/main/components/TopBar";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

function DashboardLayout() {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	// Global hotkeys for dashboard
	useAppHotkey(
		"SHOW_HOTKEYS",
		() => navigate({ to: "/settings/keyboard" }),
		undefined,
		[navigate],
	);

	useAppHotkey(
		"TOGGLE_WORKSPACE_SIDEBAR",
		() => {
			if (!isWorkspaceSidebarOpen) {
				setWorkspaceSidebarOpen(true);
			} else {
				toggleWorkspaceSidebarCollapsed();
			}
		},
		undefined,
		[
			isWorkspaceSidebarOpen,
			setWorkspaceSidebarOpen,
			toggleWorkspaceSidebarCollapsed,
		],
	);

	useAppHotkey("NEW_WORKSPACE", () => openNewWorkspaceModal(), undefined, [
		openNewWorkspaceModal,
	]);

	return (
		<div className="flex flex-col h-full w-full">
			<TopBar />
			<div className="flex flex-1 overflow-hidden">
				{isWorkspaceSidebarOpen && (
					<ResizablePanel
						width={workspaceSidebarWidth}
						onWidthChange={setWorkspaceSidebarWidth}
						isResizing={isWorkspaceSidebarResizing}
						onResizingChange={setWorkspaceSidebarIsResizing}
						minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
						maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
						handleSide="right"
						clampWidth={false}
					>
						<WorkspaceSidebar isCollapsed={isWorkspaceSidebarCollapsed()} />
					</ResizablePanel>
				)}
				<Outlet />
			</div>
		</div>
	);
}
