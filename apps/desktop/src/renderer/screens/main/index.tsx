// TEMPORARILY DISABLED - PostHog bricked the desktop app
// import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
// import { useFeatureFlagEnabled, usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { DndProvider } from "react-dnd";
import { useHotkeys } from "react-hotkeys-hook";
import { HiArrowPath } from "react-icons/hi2";
import { SetupConfigModal } from "renderer/components/SetupConfigModal";
import { trpc } from "renderer/lib/trpc";
import { useCurrentView, useOpenSettings } from "renderer/stores/app-state";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { getPaneDimensions } from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { findPanePath, getFirstPaneId } from "renderer/stores/tabs/utils";
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
	const utils = trpc.useUtils();
	// TEMPORARILY DISABLED - PostHog bricked the desktop app
	// const posthog = usePostHog();
	const { data: authState } = trpc.auth.getState.useQuery();
	const _isSignedIn = authState?.isSignedIn ?? false;
	const _isAuthLoading = !authState;

	// TEMPORARILY DISABLED - Auth blocking logic disabled
	// // Feature flag to control auth requirement
	// const requireAuth = useFeatureFlagEnabled(FEATURE_FLAGS.REQUIRE_DESKTOP_AUTH);
	// const [flagsLoaded, setFlagsLoaded] = useState(false);

	// // Track when feature flags are loaded
	// useEffect(() => {
	// 	if (posthog) {
	// 		posthog.onFeatureFlags(() => {
	// 			setFlagsLoaded(true);
	// 		});
	// 	}
	// }, [posthog]);

	// Subscribe to auth state changes
	trpc.auth.onStateChange.useSubscription(undefined, {
		onData: () => utils.auth.getState.invalidate(),
	});

	const currentView = useCurrentView();
	const openSettings = useOpenSettings();
	const { toggleSidebar } = useSidebarStore();
	const {
		data: activeWorkspace,
		isLoading: isWorkspaceLoading,
		isError,
		failureCount,
		refetch,
	} = trpc.workspaces.getActive.useQuery(undefined, {
		// TEMPORARILY DISABLED - Auth blocking logic disabled
		// enabled: isSignedIn,
	});
	const [isRetrying, setIsRetrying] = useState(false);
	const splitPaneAuto = useTabsStore((s) => s.splitPaneAuto);
	const splitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const splitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const tabs = useTabsStore((s) => s.tabs);

	useAgentHookListener();

	trpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				openSettings(event.data.section);
			}
		},
	});

	const activeWorkspaceId = activeWorkspace?.id;
	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;
	const focusedPaneId = activeTabId ? focusedPaneIds[activeTabId] : null;
	const activeTab = tabs.find((t) => t.id === activeTabId);
	const isWorkspaceView = currentView === "workspace";

	useHotkeys(HOTKEYS.SHOW_HOTKEYS.keys, () => openSettings("keyboard"), [
		openSettings,
	]);

	useHotkeys(HOTKEYS.TOGGLE_SIDEBAR.keys, () => {
		if (isWorkspaceView) toggleSidebar();
	}, [toggleSidebar, isWorkspaceView]);

	/**
	 * Resolves the target pane for split operations.
	 * If the focused pane is desynced from layout (e.g., was removed),
	 * falls back to first pane and corrects focus state.
	 */
	const resolveSplitTarget = useCallback(
		(paneId: string, tabId: string, targetTab: Tab) => {
			const path = findPanePath(targetTab.layout, paneId);
			if (path !== null) return { path, paneId };

			// Focused pane not in layout - correct focus and use first pane
			const firstPaneId = getFirstPaneId(targetTab.layout);
			const firstPanePath = findPanePath(targetTab.layout, firstPaneId);
			setFocusedPane(tabId, firstPaneId);
			return { path: firstPanePath ?? [], paneId: firstPaneId };
		},
		[setFocusedPane],
	);

	useHotkeys(HOTKEYS.SPLIT_AUTO.keys, () => {
		if (isWorkspaceView && activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			const dimensions = getPaneDimensions(target.paneId);
			if (dimensions) {
				splitPaneAuto(activeTabId, target.paneId, dimensions, target.path);
			}
		}
	}, [
		activeTabId,
		focusedPaneId,
		activeTab,
		splitPaneAuto,
		resolveSplitTarget,
		isWorkspaceView,
	]);

	useHotkeys(HOTKEYS.SPLIT_RIGHT.keys, () => {
		if (isWorkspaceView && activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			splitPaneVertical(activeTabId, target.paneId, target.path);
		}
	}, [
		activeTabId,
		focusedPaneId,
		activeTab,
		splitPaneVertical,
		resolveSplitTarget,
		isWorkspaceView,
	]);

	useHotkeys(HOTKEYS.SPLIT_DOWN.keys, () => {
		if (isWorkspaceView && activeTabId && focusedPaneId && activeTab) {
			const target = resolveSplitTarget(focusedPaneId, activeTabId, activeTab);
			if (!target) return;
			splitPaneHorizontal(activeTabId, target.paneId, target.path);
		}
	}, [
		activeTabId,
		focusedPaneId,
		activeTab,
		splitPaneHorizontal,
		resolveSplitTarget,
		isWorkspaceView,
	]);

	const isLoading = isWorkspaceLoading;
	const showStartView =
		!isLoading && !activeWorkspace && currentView !== "settings";

	// TEMPORARILY DISABLED - Auth blocking logic disabled
	// // Wait for feature flags to load before deciding on auth
	// const shouldRequireAuth = flagsLoaded && requireAuth === true;

	// // Show empty screen while feature flags are loading
	// if (!flagsLoaded) {
	// 	return (
	// 		<>
	// 			<Background />
	// 			<AppFrame>
	// 				<div className="h-full w-full bg-background" />
	// 			</AppFrame>
	// 		</>
	// 	);
	// }

	// // Show loading while auth state is being determined (only if auth is required)
	// if (shouldRequireAuth && isAuthLoading) {
	// 	return (
	// 		<>
	// 			<Background />
	// 			<AppFrame>
	// 				<div className="flex h-full w-full items-center justify-center bg-background">
	// 					<LoadingSpinner />
	// 				</div>
	// 			</AppFrame>
	// 		</>
	// 	);
	// }

	// // Show sign-in screen if auth is required and user is not signed in
	// if (shouldRequireAuth && !isSignedIn) {
	// 	return (
	// 		<>
	// 			<Background />
	// 			<AppFrame>
	// 				<SignInScreen />
	// 			</AppFrame>
	// 		</>
	// 	);
	// }

	const renderContent = () => {
		if (currentView === "settings") {
			return <SettingsView />;
		}
		return <WorkspaceView />;
	};

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
			<SetupConfigModal />
		</DndProvider>
	);
}
