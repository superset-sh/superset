import { Button } from "@superset/ui/button";
import { useState } from "react";
import { DndProvider } from "react-dnd";
import { useHotkeys } from "react-hotkeys-hook";
import { HiArrowPath } from "react-icons/hi2";
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

function LoadingSpinner() {
	return (
		<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
	);
}

export function MainScreen() {
	const currentView = useCurrentView();
	const openSettings = useOpenSettings();
	const { toggleSidebar } = useSidebarStore();
	const {
		data: activeWorkspace,
		isLoading,
		isError,
		failureCount,
		refetch,
	} = trpc.workspaces.getActive.useQuery();
	const [isRetrying, setIsRetrying] = useState(false);
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

	const showStartView =
		!isLoading && !activeWorkspace && currentView !== "settings";

	// Determine which content view to show
	const renderContent = () => {
		if (currentView === "settings") {
			return <SettingsView />;
		}
		return <WorkspaceView />;
	};

	// Show loading spinner while query is in flight
	if (isLoading) {
		return (
			<DndProvider manager={dragDropManager}>
				<Background />
				<AppFrame>
					<div className="flex h-full w-full items-center justify-center bg-background">
						<LoadingSpinner />
					</div>
				</AppFrame>
			</DndProvider>
		);
	}

	// Show error state with retry option
	// Note: failureCount resets automatically on successful query
	if (isError) {
		const hasRepeatedFailures = failureCount >= 5;

		const handleRetry = async () => {
			setIsRetrying(true);
			await refetch();
			setIsRetrying(false);
		};

		return (
			<DndProvider manager={dragDropManager}>
				<Background />
				<AppFrame>
					<div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background">
						<div className="flex flex-col items-center gap-2 text-center">
							<p className="text-sm text-muted-foreground">
								Failed to load workspace
							</p>
							{hasRepeatedFailures && (
								<p className="text-xs text-muted-foreground/70 max-w-xs">
									This may indicate a connection issue. Try restarting the app
									if the problem persists.
								</p>
							)}
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleRetry}
							disabled={isRetrying}
							className="gap-2"
						>
							{isRetrying ? (
								<LoadingSpinner />
							) : (
								<HiArrowPath className="h-4 w-4" />
							)}
							{isRetrying ? "Retrying..." : "Retry"}
						</Button>
					</div>
				</AppFrame>
			</DndProvider>
		);
	}

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
