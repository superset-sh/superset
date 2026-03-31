import "react-mosaic-component/react-mosaic-component.css";
import "./mosaic-theme.css";

import { useCallback, useEffect, useMemo } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
} from "react-mosaic-component";
import { dragDropManager } from "renderer/lib/dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { requestPaneClose } from "renderer/stores/editor-state/editorCoordinator";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	cleanLayout,
	extractPaneIdsFromLayout,
	getPaneIdSetForTab,
} from "renderer/stores/tabs/utils";
import { useTheme } from "renderer/stores/theme";
import { BrowserPane } from "./BrowserPane";
import { ChatPane } from "./ChatPane";
import { MosaicSplitOverlay } from "./components";
import { DevToolsPane } from "./DevToolsPane";
import { FileViewerPane } from "./FileViewerPane";
import { TabPane } from "./TabPane";

export const MOSAIC_ID = "superset-mosaic";

interface TabViewProps {
	tab: Tab;
}

export function TabView({ tab }: TabViewProps) {
	const activeTheme = useTheme();
	const updateTabLayout = useTabsStore((s) => s.updateTabLayout);
	const removePane = useTabsStore((s) => s.removePane);
	const removeTab = useTabsStore((s) => s.removeTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const movePaneToTab = useTabsStore((s) => s.movePaneToTab);
	const movePaneToNewTab = useTabsStore((s) => s.movePaneToNewTab);
	const allTabs = useTabsStore((s) => s.tabs);

	// Get workspace path for file viewer panes
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: tab.workspaceId },
		{ enabled: !!tab.workspaceId },
	);
	const { splitPaneAuto, splitPaneHorizontal, splitPaneVertical } =
		useTabsWithPresets(workspace?.projectId);
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

	// Digest of pane type/devtools for this tab's layout panes. Computed directly
	// in the selector so TabView only re-renders when pane types actually change
	// (e.g. a terminal becomes a chat), not on every status/CWD tick.
	const tabPanesKey = useTabsStore(
		useCallback(
			(s) =>
				layoutPaneIds
					.map((id) => {
						const pane = s.panes[id];
						if (!pane || pane.tabId !== tab.id) return "";
						return `${id}:${pane.type}:${pane.devtools?.targetPaneId ?? ""}`;
					})
					.join("|"),
			[layoutPaneIds, tab.id],
		),
	);

	// Memoize the filtered panes; reads fresh state keyed by tabPanesKey so it
	// only recalculates when pane types change, not on every pane status tick.
	const tabPanes = useMemo(() => {
		const freshPanes = useTabsStore.getState().panes;
		const result: Record<
			string,
			{
				tabId: string;
				type: string;
				devtools?: { targetPaneId: string };
			}
		> = {};
		for (const paneId of layoutPaneIds) {
			const pane = freshPanes[paneId];
			if (pane?.tabId === tab.id) {
				result[paneId] = {
					tabId: pane.tabId,
					type: pane.type,
					devtools: pane.devtools,
				};
			}
		}
		return result;
	}, [tabPanesKey, layoutPaneIds, tab.id]);

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

			// Strip panes from the layout that no longer belong to this tab.
			// This prevents Mosaic's drag-end "reset" from re-adding panes that
			// were moved to another tab (e.g., via movePaneToNewTab).
			const ownPaneIds = getPaneIdSetForTab(freshPanes, tab.id);
			const sanitizedLayout = cleanLayout(newLayout, ownPaneIds);
			if (!sanitizedLayout) return;

			if (
				process.env.NODE_ENV === "development" &&
				sanitizedLayout !== newLayout
			) {
				console.warn(
					"[TabView] Sanitized foreign panes from layout:",
					extractPaneIdsFromLayout(newLayout).filter(
						(id) => !ownPaneIds.has(id),
					),
				);
			}

			// Use fresh tab layout to determine what panes were removed
			const oldPaneIds = extractPaneIdsFromLayout(
				freshTab?.layout ?? sanitizedLayout,
			);
			const newPaneIds = extractPaneIdsFromLayout(sanitizedLayout);

			// Find removed panes (e.g., from Mosaic close button)
			const removedPaneIds = oldPaneIds.filter(
				(id) => !newPaneIds.includes(id),
			);

			// Remove panes that were removed via Mosaic UI
			for (const removedId of removedPaneIds) {
				const pane = freshPanes[removedId];
				if (pane && pane.tabId === tab.id) {
					if (pane.type === "file-viewer") {
						requestPaneClose(removedId);
						return;
					}
					removePane(removedId);
				}
			}

			updateTabLayout(tab.id, sanitizedLayout);
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

			// Route chat panes to ChatPane component
			if (paneInfo.type === "chat") {
				return (
					<ChatPane
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
		],
	);

	const handleSplitLayoutChange = useCallback(
		(newLayout: MosaicNode<string>) => {
			updateTabLayout(tab.id, newLayout);
		},
		[tab.id, updateTabLayout],
	);

	// Tab will be removed by useEffect above
	if (!cleanedLayout) {
		return null;
	}

	return (
		<div className="relative w-full h-full mosaic-container">
			<Mosaic<string>
				mosaicId={MOSAIC_ID}
				renderTile={renderPane}
				value={cleanedLayout}
				onChange={handleLayoutChange}
				resize="DISABLED"
				className={
					activeTheme?.type === "light"
						? "mosaic-theme-light"
						: "mosaic-theme-dark"
				}
				dragAndDropManager={dragDropManager}
			/>
			<MosaicSplitOverlay
				layout={cleanedLayout}
				onLayoutChange={handleSplitLayoutChange}
			/>
		</div>
	);
}
