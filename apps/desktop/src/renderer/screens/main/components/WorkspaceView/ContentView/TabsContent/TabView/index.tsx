import "react-mosaic-component/react-mosaic-component.css";
import "./mosaic-theme.css";

import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useMemo } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
} from "react-mosaic-component";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	cleanLayout,
	extractPaneIdsFromLayout,
} from "renderer/stores/tabs/utils";
import { useTheme } from "renderer/stores/theme";
import { BrowserPane } from "./BrowserPane";
import { ChatMastraPane } from "./ChatMastraPane";
import { DevToolsPane } from "./DevToolsPane";
import { FileViewerPane } from "./FileViewerPane";
import { TabPane } from "./TabPane";

interface TabViewProps {
	tab: Tab;
}

export function TabView({ tab }: TabViewProps) {
	const activeTheme = useTheme();
	const updateTabLayout = useTabsStore((s) => s.updateTabLayout);
	const removePane = useTabsStore((s) => s.removePane);
	const removeTab = useTabsStore((s) => s.removeTab);
	const { splitPaneAuto, splitPaneHorizontal, splitPaneVertical } =
		useTabsWithPresets();
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const movePaneToTab = useTabsStore((s) => s.movePaneToTab);
	const movePaneToNewTab = useTabsStore((s) => s.movePaneToNewTab);
	const hasAiChat = useFeatureFlagEnabled(FEATURE_FLAGS.AI_CHAT);
	const allTabs = useTabsStore((s) => s.tabs);
	const allPanes = useTabsStore((s) => s.panes);

	// Get workspace path for file viewer panes
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: tab.workspaceId },
		{ enabled: !!tab.workspaceId },
	);
	const worktreePath = workspace?.worktreePath ?? "";

	// Get tabs in the same workspace for move targets
	const workspaceTabs = useMemo(
		() => allTabs.filter((t) => t.workspaceId === tab.workspaceId),
		[allTabs, tab.workspaceId],
	);

	// Extract pane IDs from layout
	const layoutPaneIds = useMemo(
		() => extractPaneIdsFromLayout(tab.layout),
		[tab.layout],
	);

	// Memoize the filtered panes to avoid creating new objects on every render
	const tabPanes = useMemo(() => {
		const result: Record<
			string,
			{
				tabId: string;
				type: string;
				devtools?: { targetPaneId: string };
			}
		> = {};
		for (const paneId of layoutPaneIds) {
			const pane = allPanes[paneId];
			if (pane?.tabId === tab.id) {
				result[paneId] = {
					tabId: pane.tabId,
					type: pane.type,
					devtools: pane.devtools,
				};
			}
		}
		return result;
	}, [layoutPaneIds, allPanes, tab.id]);

	const validPaneIds = new Set(Object.keys(tabPanes));
	const cleanedLayout = cleanLayout(tab.layout, validPaneIds);

	// Auto-remove tab when all panes are gone
	useEffect(() => {
		if (!cleanedLayout) {
			removeTab(tab.id);
		}
	}, [cleanedLayout, removeTab, tab.id]);

	const handleLayoutChange = useCallback(
		(newLayout: MosaicNode<string> | null) => {
			if (!newLayout) {
				// This shouldn't happen as we handle last pane removal in removePane
				return;
			}

			// Get fresh data from store to avoid stale closure issues
			// This is critical for drag-drop operations where state may have changed
			// between when this callback was created and when it's invoked
			const state = useTabsStore.getState();
			const freshTab = state.tabs.find((t) => t.id === tab.id);
			const freshPanes = state.panes;

			// Use fresh tab layout to determine what panes were removed
			const oldPaneIds = extractPaneIdsFromLayout(
				freshTab?.layout ?? newLayout,
			);
			const newPaneIds = extractPaneIdsFromLayout(newLayout);

			// Find removed panes (e.g., from Mosaic close button)
			const removedPaneIds = oldPaneIds.filter(
				(id) => !newPaneIds.includes(id),
			);

			// Remove panes that were removed via Mosaic UI
			// But skip panes that were moved to another tab (their tabId changed)
			for (const removedId of removedPaneIds) {
				const pane = freshPanes[removedId];
				// Only remove if pane still belongs to this tab (actual removal, not move)
				if (pane && pane.tabId === tab.id) {
					removePane(removedId);
				}
			}

			updateTabLayout(tab.id, newLayout);
		},
		[tab.id, updateTabLayout, removePane],
	);

	const renderPane = useCallback(
		(paneId: string, path: MosaicBranch[]) => {
			const paneInfo = tabPanes[paneId];

			if (!paneInfo) {
				return (
					<div className="w-full h-full flex items-center justify-center text-muted-foreground">
						Pane not found: {paneId}
					</div>
				);
			}

			// Route file-viewer panes to FileViewerPane component
			if (paneInfo.type === "file-viewer") {
				if (!worktreePath) {
					return (
						<div className="w-full h-full flex items-center justify-center text-muted-foreground">
							Workspace path unavailable
						</div>
					);
				}
				return (
					<FileViewerPane
						paneId={paneId}
						path={path}
						tabId={tab.id}
						worktreePath={worktreePath}
						splitPaneAuto={splitPaneAuto}
						splitPaneHorizontal={splitPaneHorizontal}
						splitPaneVertical={splitPaneVertical}
						removePane={removePane}
						setFocusedPane={setFocusedPane}
						availableTabs={workspaceTabs}
						onMoveToTab={(targetTabId) => movePaneToTab(paneId, targetTabId)}
						onMoveToNewTab={() => movePaneToNewTab(paneId)}
					/>
				);
			}

			// Route chat panes to ChatMastraPane component
			if (paneInfo.type === "chat-mastra" && hasAiChat) {
				return (
					<ChatMastraPane
						paneId={paneId}
						path={path}
						tabId={tab.id}
						workspaceId={tab.workspaceId}
						splitPaneAuto={splitPaneAuto}
						removePane={removePane}
						setFocusedPane={setFocusedPane}
					/>
				);
			}

			// Route browser panes to BrowserPane component
			if (paneInfo.type === "webview") {
				return (
					<BrowserPane
						paneId={paneId}
						path={path}
						tabId={tab.id}
						splitPaneAuto={splitPaneAuto}
						removePane={removePane}
						setFocusedPane={setFocusedPane}
					/>
				);
			}

			// Route devtools panes
			if (paneInfo.type === "devtools" && paneInfo.devtools) {
				return (
					<DevToolsPane
						paneId={paneId}
						path={path}
						tabId={tab.id}
						targetPaneId={paneInfo.devtools.targetPaneId}
						splitPaneAuto={splitPaneAuto}
						removePane={removePane}
						setFocusedPane={setFocusedPane}
					/>
				);
			}

			// Default: terminal panes
			return (
				<TabPane
					paneId={paneId}
					path={path}
					tabId={tab.id}
					workspaceId={tab.workspaceId}
					splitPaneAuto={splitPaneAuto}
					splitPaneHorizontal={splitPaneHorizontal}
					splitPaneVertical={splitPaneVertical}
					removePane={removePane}
					setFocusedPane={setFocusedPane}
					availableTabs={workspaceTabs}
					onMoveToTab={(targetTabId) => movePaneToTab(paneId, targetTabId)}
					onMoveToNewTab={() => movePaneToNewTab(paneId)}
				/>
			);
		},
		[
			tabPanes,
			tab.id,
			tab.workspaceId,
			worktreePath,
			splitPaneAuto,
			splitPaneHorizontal,
			splitPaneVertical,
			removePane,
			setFocusedPane,
			workspaceTabs,
			movePaneToTab,
			movePaneToNewTab,
			hasAiChat,
		],
	);

	// Tab will be removed by useEffect above
	if (!cleanedLayout) {
		return null;
	}

	return (
		<div className="w-full h-full mosaic-container">
			<Mosaic<string>
				renderTile={renderPane}
				value={cleanedLayout}
				onChange={handleLayoutChange}
				className={
					activeTheme?.type === "light"
						? "mosaic-theme-light"
						: "mosaic-theme-dark"
				}
				dragAndDropManager={dragDropManager}
			/>
		</div>
	);
}
