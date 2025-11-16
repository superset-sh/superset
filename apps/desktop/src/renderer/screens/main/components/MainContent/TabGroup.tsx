import { useCallback, useEffect, useState } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
	MosaicWindow,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";
import type { Tab } from "shared/types";
import { useWorkspaceContext, useTabContext } from "../../../../contexts";
import TabContent from "./TabContent";
import { TabDropZone } from "./TabDropZone";
import {
	buildBalancedMosaicTree,
	getTabIdsFromTree,
	insertTabIntoMosaicTree,
	handleTabDropValidation,
} from "./mosaic-helpers";

interface ScreenLayoutProps {
	groupTab: Tab; // A tab with type: "group"
}

export default function TabGroup({ groupTab }: ScreenLayoutProps) {
	const { currentWorkspace } = useWorkspaceContext();
	const { selectedWorktreeId, selectedTabId, handleTabFocus } = useTabContext();
	
	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);
	
	const workingDirectory = selectedWorktree?.path || currentWorkspace?.repoPath || "";
	const workspaceId = currentWorkspace?.id || "";
	const worktreeId = selectedWorktreeId ?? undefined;

	// Initialize mosaic tree from groupTab or create a balanced tree from all tabs
	const [mosaicTree, setMosaicTree] = useState<MosaicNode<string> | null | undefined>(
		() => {
			if (groupTab.mosaicTree) {
				return groupTab.mosaicTree as MosaicNode<string>;
			}

			// If no mosaic tree exists but tabs exist, build a balanced tree for all tabs
			if (groupTab.tabs && groupTab.tabs.length > 0) {
				const tabIds = groupTab.tabs.map((tab) => tab.id);
				return buildBalancedMosaicTree(tabIds);
			}

			return undefined;
		},
	);

	// Sync mosaic tree when groupTab.mosaicTree changes externally or when tabs are added/removed
	useEffect(() => {
		if (groupTab.mosaicTree) {
			setMosaicTree(groupTab.mosaicTree as MosaicNode<string>);
		} else if (groupTab.tabs && groupTab.tabs.length > 0) {
			// Reconstruct a balanced tree if it was cleared but tabs exist
			const tabIds = groupTab.tabs.map((tab) => tab.id);
			setMosaicTree(buildBalancedMosaicTree(tabIds));
		}
	}, [groupTab.mosaicTree, groupTab.tabs]);

	// Save mosaic tree changes to backend
	const handleMosaicChange = useCallback(
		async (newTree: MosaicNode<string> | null) => {
			if (!worktreeId) return;

			// Detect which tabs were removed from the mosaic tree
			const oldTabIds = getTabIdsFromTree(mosaicTree);
			const newTabIds = getTabIdsFromTree(newTree);
			const removedTabIds = Array.from(oldTabIds).filter(
				(id) => !newTabIds.has(id),
			);

			try {
				// First, delete any tabs that were removed from the mosaic
				for (const removedTabId of removedTabIds) {
					await window.ipcRenderer.invoke("tab-delete", {
						workspaceId,
						worktreeId,
						tabId: removedTabId,
					});
				}

				// Convert null to undefined for backend compatibility
				const treeToSave = newTree === null ? undefined : newTree;

				// Then update the mosaic tree
				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId,
					worktreeId,
					tabId: groupTab.id,
					mosaicTree: treeToSave,
				});

				// Update local state after successful backend update
				setMosaicTree(treeToSave);
			} catch (error) {
				console.error("Failed to save mosaic tree:", error);
			}
		},
		[workspaceId, worktreeId, groupTab.id, mosaicTree],
	);

	// Handle tab drop from sidebar
	const handleTabDrop = useCallback(
		async (
			droppedTab: Tab,
			sourceWorktreeId: string,
			sourceWorkspaceId: string,
			position: "top" | "right" | "bottom" | "left" | "center",
		) => {
			if (!worktreeId || !workspaceId) return;

			try {
				// Validate the drop operation
				const validation = await handleTabDropValidation({
					droppedTab,
					sourceWorktreeId,
					targetWorktreeId: worktreeId,
					workspaceId,
					existingTree: mosaicTree,
				});

				if (!validation.valid) {
					console.log(`Drop blocked: ${validation.reason}`);
					return;
				}

				const tabToAdd = validation.tab!;

				// Move the tab into this group
				await window.ipcRenderer.invoke("tab-move", {
					workspaceId,
					worktreeId,
					tabId: tabToAdd.id,
					targetParentTabId: groupTab.id,
					targetIndex: 0,
				});

				// Update the mosaic tree to include the new tab
				const newTree = insertTabIntoMosaicTree(mosaicTree, tabToAdd.id, position);

				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId,
					worktreeId,
					tabId: groupTab.id,
					mosaicTree: newTree,
				});

				// Update local state
				setMosaicTree(newTree);

				// Trigger a reload to refresh the workspace data
				window.location.reload();
			} catch (error) {
				console.error("Failed to handle tab drop:", error);
			}
		},
		[workspaceId, worktreeId, groupTab.id, mosaicTree],
	);

	// Create a map of tab IDs to Tab objects for easy lookup
	const tabsById = new Map(groupTab.tabs?.map((tab) => [tab.id, tab]) || []);

	// Render individual mosaic tile
	const renderTile = useCallback(
		(id: string, path: MosaicBranch[]) => {
			const tab = tabsById.get(id);
			if (!tab) {
				return (
					<div className="w-full h-full flex items-center justify-center text-gray-400">
						Tab not found: {id}
					</div>
				);
			}

			const isActive = selectedTabId === id;

			return (
				<MosaicWindow<string>
					path={path}
					title={tab.name}
					className={isActive ? "active-mosaic-window" : ""}
					toolbarControls={<div />}
				>
					<div
						className="w-full h-full p-2 bg-[#1e1e1e] mosaic-window-content"
						tabIndex={0}
						role="region"
						aria-label={`${tab.name} content`}
					>
						<TabContent
							tab={tab}
							groupTabId={groupTab.id}
							isVisibleInMosaic={true}
						/>
					</div>
				</MosaicWindow>
			);
		},
		[
			tabsById,
			selectedTabId,
			workingDirectory,
			workspaceId,
			worktreeId,
			groupTab.id,
			handleTabFocus,
		],
	);

	// Safety check: ensure groupTab is a group type with tabs
	if (
		!groupTab ||
		groupTab.type !== "group" ||
		!groupTab.tabs ||
		!Array.isArray(groupTab.tabs) ||
		groupTab.tabs.length === 0
	) {
		return (
			<div className="w-full h-full flex items-center justify-center text-gray-400">
				<div className="text-center">
					<p>No tabs in this group</p>
					<p className="text-sm text-gray-500 mt-2">
						Create a new tab to get started
					</p>
				</div>
			</div>
		);
	}

	if (!mosaicTree) {
		return (
			<div className="w-full h-full flex items-center justify-center text-gray-400">
				<div className="text-center">
					<p>Invalid mosaic layout</p>
					<p className="text-sm text-gray-500 mt-2">
						Please rescan worktrees or recreate the group
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full h-full mosaic-container relative">
			<Mosaic<string>
				renderTile={renderTile}
				value={mosaicTree}
				onChange={handleMosaicChange}
				className="mosaic-theme-dark"
			/>
			<TabDropZone onDrop={handleTabDrop} />
			<style>{`
				.mosaic-container {
					background: #1a1a1a;
				}
				.mosaic-theme-dark .mosaic-window {
					background: #1a1a1a;
					border: 1px solid #333;
					transition: border-color 0.15s ease, box-shadow 0.15s ease;
				}
				.mosaic-theme-dark .mosaic-window .mosaic-window-toolbar {
					background: #262626;
					border-bottom: 1px solid #333;
					height: 32px;
					padding: 0 8px;
					transition: background-color 0.15s ease;
				}
				.mosaic-theme-dark .mosaic-window .mosaic-window-title {
					color: #e5e5e5;
					font-size: 12px;
					transition: color 0.15s ease;
				}
				.mosaic-theme-dark .mosaic-window-body {
					background: #1a1a1a;
				}
				.mosaic-window-content {
					outline: none;
				}
				.mosaic-window-content:focus-visible {
					outline: 2px solid #3b82f6;
					outline-offset: -2px;
					box-shadow: inset 0 0 0 4px rgba(59, 130, 246, 0.2);
				}
				.mosaic-theme-dark .mosaic-split {
					background: #333;
					opacity: 0;
					border-radius: 25px;
					transition: opacity 0.2s ease, background-color 0.2s ease;
				}
				.mosaic-theme-dark .mosaic-split:hover {
					opacity: 1;
					background: #444;
				}
				.mosaic-theme-dark .mosaic-split.mosaic-split-dragging {
					opacity: 1;
					background: #555;
				}
				.active-mosaic-window .mosaic-window-toolbar {
					background: #3a3a3a !important;
				}
			`}</style>
		</div>
	);
}
