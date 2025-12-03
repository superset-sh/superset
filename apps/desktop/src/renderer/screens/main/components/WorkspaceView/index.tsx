import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useWindowsStore } from "renderer/stores/tabs/store";
import { HOTKEYS } from "shared/hotkeys";
import { ContentView } from "./ContentView";
import { Sidebar } from "./Sidebar";

export function WorkspaceView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allWindows = useWindowsStore((s) => s.windows);
	const activeWindowIds = useWindowsStore((s) => s.activeWindowIds);
	const focusedPaneIds = useWindowsStore((s) => s.focusedPaneIds);
	const addWindow = useWindowsStore((s) => s.addWindow);
	const setActiveWindow = useWindowsStore((s) => s.setActiveWindow);
	const removePane = useWindowsStore((s) => s.removePane);

	const windows = useMemo(
		() =>
			activeWorkspaceId
				? allWindows.filter((win) => win.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, allWindows],
	);

	const activeWindowId = activeWorkspaceId
		? activeWindowIds[activeWorkspaceId]
		: null;

	// Get focused pane ID for the active window
	const focusedPaneId = activeWindowId ? focusedPaneIds[activeWindowId] : null;

	// Window management shortcuts
	useHotkeys(HOTKEYS.NEW_TERMINAL.keys, () => {
		if (activeWorkspaceId) {
			addWindow(activeWorkspaceId);
		}
	}, [activeWorkspaceId, addWindow]);

	useHotkeys(HOTKEYS.CLOSE_TERMINAL.keys, () => {
		// Close focused pane (which may close the window if it's the last pane)
		if (focusedPaneId) {
			removePane(focusedPaneId);
		}
	}, [focusedPaneId, removePane]);

	// Switch between windows (⌘+Up/Down)
	useHotkeys(HOTKEYS.PREV_TERMINAL.keys, () => {
		if (!activeWorkspaceId || !activeWindowId) return;
		const index = windows.findIndex((w) => w.id === activeWindowId);
		if (index > 0) {
			setActiveWindow(activeWorkspaceId, windows[index - 1].id);
		}
	}, [activeWorkspaceId, activeWindowId, windows, setActiveWindow]);

	useHotkeys(HOTKEYS.NEXT_TERMINAL.keys, () => {
		if (!activeWorkspaceId || !activeWindowId) return;
		const index = windows.findIndex((w) => w.id === activeWindowId);
		if (index < windows.length - 1) {
			setActiveWindow(activeWorkspaceId, windows[index + 1].id);
		}
	}, [activeWorkspaceId, activeWindowId, windows, setActiveWindow]);

	// Open in last used app shortcut
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation();
	useHotkeys("meta+o", () => {
		if (activeWorkspace?.worktreePath) {
			openInApp.mutate({
				path: activeWorkspace.worktreePath,
				app: lastUsedApp,
			});
		}
	}, [activeWorkspace?.worktreePath, lastUsedApp]);

	// Copy path shortcut
	const copyPath = trpc.external.copyPath.useMutation();
	useHotkeys("meta+shift+c", () => {
		if (activeWorkspace?.worktreePath) {
			copyPath.mutate(activeWorkspace.worktreePath);
		}
	}, [activeWorkspace?.worktreePath]);

	return (
		<div className="flex flex-1 bg-tertiary">
			<Sidebar />
			<div className="flex-1 m-3 bg-background rounded flex flex-col overflow-hidden">
				<div className="flex-1 p-2 overflow-hidden">
					<ContentView />
				</div>
			</div>
		</div>
	);
}
