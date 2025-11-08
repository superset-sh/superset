import { useCallback, useEffect, useState } from "react";
import {
	Mosaic,
	type MosaicBranch,
	type MosaicNode,
	MosaicWindow,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";
import type { Tab } from "shared/types";
import TabContent from "./TabContent";

interface ScreenLayoutProps {
	groupTab: Tab; // A tab with type: "group"
	workingDirectory: string;
	workspaceId: string;
	worktreeId: string | undefined;
	selectedTabId: string | undefined;
	onTabFocus: (tabId: string) => void;
	workspaceName?: string;
	mainBranch?: string;
}

export default function TabGroup({
	groupTab,
	workingDirectory,
	workspaceId,
	worktreeId,
	selectedTabId,
	onTabFocus,
	workspaceName,
	mainBranch,
}: ScreenLayoutProps) {
	// Initialize mosaic tree from groupTab or create a default tree
	const [mosaicTree, setMosaicTree] = useState<MosaicNode<string> | null>(
		() => {
			if (groupTab.mosaicTree) {
				return groupTab.mosaicTree as MosaicNode<string>;
			}

			// If no mosaic tree exists but tabs exist, create a default layout
			if (groupTab.tabs && groupTab.tabs.length > 0) {
				if (groupTab.tabs.length === 1) {
					return groupTab.tabs[0].id;
				}
				if (groupTab.tabs.length === 2) {
					// Simple row split for 2 tabs
					return {
						direction: "row",
						first: groupTab.tabs[0].id,
						second: groupTab.tabs[1].id,
					};
				}
				// For 3+ tabs, create nested layout
				return {
					direction: "row",
					first: groupTab.tabs[0].id,
					second: {
						direction: "column",
						first: groupTab.tabs[1].id,
						second: groupTab.tabs[2].id,
					},
				};
			}

			return null;
		},
	);

	// Sync mosaic tree when groupTab.mosaicTree changes externally
	useEffect(() => {
		if (groupTab.mosaicTree) {
			setMosaicTree(groupTab.mosaicTree as MosaicNode<string>);
		} else if (groupTab.tabs && groupTab.tabs.length > 0) {
			// Reconstruct tree if it was cleared but tabs exist
			if (groupTab.tabs.length === 1) {
				setMosaicTree(groupTab.tabs[0].id);
			} else if (groupTab.tabs.length === 2) {
				// Simple row split for 2 tabs
				setMosaicTree({
					direction: "row",
					first: groupTab.tabs[0].id,
					second: groupTab.tabs[1].id,
				});
			} else {
				// For 3+ tabs, create nested layout
				setMosaicTree({
					direction: "row",
					first: groupTab.tabs[0].id,
					second: {
						direction: "column",
						first: groupTab.tabs[1].id,
						second: groupTab.tabs[2].id,
					},
				});
			}
		}
	}, [groupTab.mosaicTree, groupTab.tabs]);

	// Helper function to get all tab IDs from a mosaic tree
	const getTabIdsFromTree = useCallback(
		(tree: MosaicNode<string> | null): Set<string> => {
			const ids = new Set<string>();
			if (!tree) return ids;

			if (typeof tree === "string") {
				ids.add(tree);
			} else {
				const firstIds = getTabIdsFromTree(tree.first);
				const secondIds = getTabIdsFromTree(tree.second);
				firstIds.forEach((id) => {
					ids.add(id);
				});
				secondIds.forEach((id) => {
					ids.add(id);
				});
			}
			return ids;
		},
		[],
	);

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

				// Then update the mosaic tree
				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId,
					worktreeId,
					tabId: groupTab.id,
					mosaicTree: newTree,
				});

				// Update local state after successful backend update
				setMosaicTree(newTree);
			} catch (error) {
				console.error("Failed to save mosaic tree:", error);
			}
		},
		[workspaceId, worktreeId, groupTab.id, mosaicTree, getTabIdsFromTree],
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
					<div className="w-full h-full p-2 bg-[#1e1e1e]">
						<TabContent
							tab={tab}
							workingDirectory={workingDirectory}
							workspaceId={workspaceId}
							worktreeId={worktreeId}
							groupTabId={groupTab.id}
							selectedTabId={selectedTabId}
							onTabFocus={onTabFocus}
							workspaceName={workspaceName}
							mainBranch={mainBranch}
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
			onTabFocus,
			workspaceName,
			mainBranch,
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
		<div className="w-full h-full mosaic-container">
			<Mosaic<string>
				renderTile={renderTile}
				value={mosaicTree}
				onChange={handleMosaicChange}
				className="mosaic-theme-dark"
			/>
			<style>{`
				.mosaic-container {
					background: #1a1a1a;
				}
				.mosaic-theme-dark .mosaic-window {
					background: #1a1a1a;
					border: 1px solid #333;
				}
				.mosaic-theme-dark .mosaic-window .mosaic-window-toolbar {
					background: #262626;
					border-bottom: 1px solid #333;
					height: 32px;
					padding: 0 8px;
				}
				.mosaic-theme-dark .mosaic-window .mosaic-window-title {
					color: #e5e5e5;
					font-size: 12px;
				}
				.mosaic-theme-dark .mosaic-window-body {
					background: #1a1a1a;
				}
				.mosaic-theme-dark .mosaic-split {
					background: #333;
				}
				.mosaic-theme-dark .mosaic-split:hover {
					background: #444;
				}
				.active-mosaic-window .mosaic-window {
					border: 1px solid #3b82f6 !important;
					box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
				}
			`}</style>
		</div>
	);
}
