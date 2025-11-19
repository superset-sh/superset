import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { ChevronRight, Edit2, FolderOpen } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { NodeApi, TreeApi } from "react-arborist";
import { Tree } from "react-arborist";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "renderer/components/ui/dialog";
import { dragDropManager } from "renderer/lib/dnd";
import type { Tab, Worktree } from "shared/types";
import { WorktreePortsList } from "../WorktreePortsList";
import { GitStatusDialog } from "./components/GitStatusDialog";
import { TabItem } from "./components/TabItem";

interface WorktreeItemProps {
	worktree: Worktree;
	workspaceId: string;
	activeWorktreeId: string | null;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
	hasPortForwarding?: boolean;
	onCloneWorktree: () => void;
}

// Convert Tab[] to react-arborist format
function convertTabsToTreeData(tabs: Tab[]): Array<{
	id: string;
	name: string;
	tab: Tab;
	children?: Array<{ id: string; name: string; tab: Tab }>;
}> {
	return tabs.map((tab) => {
		const node: {
			id: string;
			name: string;
			tab: Tab;
			children?: Array<{ id: string; name: string; tab: Tab }>;
		} = {
			id: tab.id,
			name: tab.name,
			tab,
		};
		if (tab.type === "group" && tab.tabs) {
			node.children = convertTabsToTreeData(tab.tabs);
		}
		return node;
	});
}

// Convert react-arborist data back to Tab[]
function convertTreeDataToTabs(nodes: NodeApi[]): Tab[] {
	return nodes.map((node) => {
		const tab = node.data.tab as Tab;
		if (tab.type === "group" && node.children && node.children.length > 0) {
			return {
				...tab,
				tabs: convertTreeDataToTabs(node.children),
			};
		}
		return tab;
	});
}

export function WorktreeItem({
	worktree,
	workspaceId,
	activeWorktreeId,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
	hasPortForwarding = false,
	onCloneWorktree: _onCloneWorktree,
}: WorktreeItemProps) {
	const [expandedGroupTabs, setExpandedGroupTabs] = useState<Set<string>>(
		new Set(),
	);
	const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
	const [lastClickedTabId, setLastClickedTabId] = useState<string | null>(null);

	// Dialog states
	const [showRemoveDialog, setShowRemoveDialog] = useState(false);
	const [showMergeDialog, setShowMergeDialog] = useState(false);
	const [showErrorDialog, setShowErrorDialog] = useState(false);
	const [showGitStatusDialog, setShowGitStatusDialog] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [errorTitle, setErrorTitle] = useState("");
	const [mergeWarning, setMergeWarning] = useState("");
	const [removeWarning, setRemoveWarning] = useState("");

	const isActive = activeWorktreeId === worktree.id;
	const tabs = Array.isArray(worktree.tabs) ? worktree.tabs : [];
	const treeData = convertTabsToTreeData(tabs);

	// Auto-expand group tabs that contain the selected tab
	useEffect(() => {
		if (!selectedTabId) return;
		const findParentGroup = (tabs: Tab[], tabId: string): Tab | null => {
			for (const tab of tabs) {
				if (tab.type === "group" && tab.tabs) {
					if (tab.tabs.some((t) => t.id === tabId)) return tab;
					const found = findParentGroup(tab.tabs, tabId);
					if (found) return found;
				}
			}
			return null;
		};
		const parentGroup = findParentGroup(tabs, selectedTabId);
		if (parentGroup) {
			setExpandedGroupTabs((prev) => new Set(prev).add(parentGroup.id));
		}
	}, [selectedTabId, tabs]);

	// Handle tab selection
	const handleTabSelect = (
		worktreeId: string,
		tabId: string,
		shiftKey: boolean,
	) => {
		if (shiftKey && lastClickedTabId) {
			// Shift-click: select range
			const allTabs = tabs.flatMap((t) =>
				t.type === "group" && t.tabs ? t.tabs : [t],
			);
			const lastIndex = allTabs.findIndex((t) => t.id === lastClickedTabId);
			const currentIndex = allTabs.findIndex((t) => t.id === tabId);
			if (lastIndex !== -1 && currentIndex !== -1) {
				const start = Math.min(lastIndex, currentIndex);
				const end = Math.max(lastIndex, currentIndex);
				const rangeTabIds = allTabs.slice(start, end + 1).map((t) => t.id);
				setSelectedTabIds(new Set(rangeTabIds));
			}
		} else {
			setSelectedTabIds(new Set([tabId]));
			setLastClickedTabId(tabId);
		}
		onTabSelect(worktreeId, tabId);
	};

	// Handle drag and drop (move)
	const handleMove = async (args: {
		dragIds: string[];
		dragNodes: NodeApi<{
			id: string;
			name: string;
			tab: Tab;
			children?: Array<{ id: string; name: string; tab: Tab }>;
		}>[];
		parentId: string | null;
		parentNode: NodeApi<{
			id: string;
			name: string;
			tab: Tab;
			children?: Array<{ id: string; name: string; tab: Tab }>;
		}> | null;
		index: number;
	}) => {
		if (args.dragNodes.length === 0) return;

		const draggedNode = args.dragNodes[0];
		const draggedTab = draggedNode.data.tab as Tab;

		if (!draggedTab || draggedTab.type === "group") return;

		const draggedTabId = draggedTab.id;
		const sourceParent = draggedNode.parent;
		const sourceParentTabId =
			sourceParent?.data.tab?.type === "group" ? sourceParent.id : null;
		const targetParentTabId =
			args.parentNode?.data.tab?.type === "group" ? args.parentNode.id : null;

		// Don't move if already in the same position
		if (sourceParentTabId === targetParentTabId) {
			return;
		}

		try {
			const result = await window.ipcRenderer.invoke("tab-move", {
				workspaceId,
				worktreeId: worktree.id,
				tabId: draggedTabId,
				sourceParentTabId: sourceParentTabId || undefined,
				targetParentTabId: targetParentTabId || undefined,
				targetIndex: args.index,
			});

			if (result.success) {
				onReload();
				onTabSelect(worktree.id, draggedTabId);
			} else {
				console.error("Failed to move tab:", result.error);
			}
		} catch (error) {
			console.error("Error moving tab:", error);
		}
	};

	// Handle tab removal
	const handleTabRemove = async (tabId: string) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-delete", {
				workspaceId,
				worktreeId: worktree.id,
				tabId,
			});

			if (result.success) {
				onReload();
			} else {
				console.error("Failed to delete tab:", result.error);
			}
		} catch (error) {
			console.error("Error deleting tab:", error);
		}
	};

	// Handle tab rename
	const handleTabRename = async (tabId: string, newName: string) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-update-name", {
				workspaceId,
				worktreeId: worktree.id,
				tabId,
				name: newName,
			});

			if (result.success) {
				onReload();
			} else {
				alert(`Failed to rename tab: ${result.error}`);
			}
		} catch (error) {
			console.error("Error renaming tab:", error);
			alert("Failed to rename tab");
		}
	};

	// Handle group rename
	const handleRenameGroup = async (groupTabId: string, newName: string) => {
		await handleTabRename(groupTabId, newName);
	};

	// Handle ungroup
	const handleUngroupTab = async (groupTabId: string) => {
		const groupTab = tabs.find((t) => t.id === groupTabId);
		if (!groupTab || groupTab.type !== "group" || !groupTab.tabs) return;

		for (const childTab of groupTab.tabs) {
			await window.ipcRenderer.invoke("tab-move", {
				workspaceId,
				worktreeId: worktree.id,
				tabId: childTab.id,
				sourceParentTabId: groupTabId,
				targetParentTabId: undefined,
				targetIndex: tabs.length,
			});
		}

		await window.ipcRenderer.invoke("tab-delete", {
			workspaceId,
			worktreeId: worktree.id,
			tabId: groupTabId,
		});

		onReload();
	};

	// Handle grouping selected tabs
	const handleGroupTabs = async (tabIds: string[]) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId,
				worktreeId: worktree.id,
				name: `Tab Group`,
				type: "group",
			});

			if (!result.success || !result.tab) {
				console.error("Failed to create group tab:", result.error);
				return;
			}

			const groupTabId = result.tab.id;

			for (const tabId of tabIds) {
				await window.ipcRenderer.invoke("tab-move", {
					workspaceId,
					worktreeId: worktree.id,
					tabId,
					targetParentTabId: groupTabId,
					targetIndex: 0,
				});
			}

			onReload();
			setExpandedGroupTabs((prev) => new Set(prev).add(groupTabId));
			onTabSelect(worktree.id, groupTabId);
			setSelectedTabIds(new Set());
			setLastClickedTabId(null);
		} catch (error) {
			console.error("Error grouping tabs:", error);
		}
	};

	// Handle moving tab out of group
	const handleMoveOutOfGroup = async (tabId: string, parentTabId: string) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-move", {
				workspaceId,
				worktreeId: worktree.id,
				tabId,
				sourceParentTabId: parentTabId,
				targetParentTabId: undefined,
				targetIndex: tabs.length,
			});

			if (result.success) {
				onReload();
				onTabSelect(worktree.id, tabId);
			} else {
				console.error("Failed to move tab out of group:", result.error);
			}
		} catch (error) {
			console.error("Error moving tab out of group:", error);
		}
	};

	if (!isActive) {
		return null;
	}

	// Render node content
	const renderNode = (props: {
		node: NodeApi<{
			id: string;
			name: string;
			tab: Tab;
			children?: Array<{ id: string; name: string; tab: Tab }>;
		}>;
		style: React.CSSProperties;
		tree: TreeApi<{
			id: string;
			name: string;
			tab: Tab;
			children?: Array<{ id: string; name: string; tab: Tab }>;
		}>;
		dragHandle?: (el: HTMLDivElement | null) => void;
		preview?: boolean;
	}) => {
		const { node, style } = props;
		const tab = node.data.tab as Tab;
		const isGroup = tab.type === "group";
		const isSelected = selectedTabId === tab.id;
		const isExpanded = node.isOpen;

		if (isGroup) {
			return (
				<div style={style} className="flex items-center">
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<button
								type="button"
								onClick={() => {
									node.toggle();
									handleTabSelect(worktree.id, tab.id, false);
								}}
								className={`group flex items-center gap-1.5 w-full h-7 px-2.5 text-xs rounded-md transition-all ${
									isSelected
										? "bg-neutral-800/80 text-neutral-200"
										: "hover:bg-neutral-800/40 text-neutral-400"
								}`}
								style={{ paddingLeft: `${node.level * 12 + 10}px` }}
							>
								<ChevronRight
									size={11}
									className={`transition-transform ${isExpanded ? "rotate-90" : ""} shrink-0 text-neutral-500`}
								/>
								<span className="truncate flex-1 text-left">{tab.name}</span>
							</button>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem
								onClick={() => handleRenameGroup(tab.id, tab.name)}
							>
								<Edit2 size={14} className="mr-2" />
								Rename
							</ContextMenuItem>
							<ContextMenuItem onClick={() => handleUngroupTab(tab.id)}>
								<FolderOpen size={14} className="mr-2" />
								Ungroup Tabs
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				</div>
			);
		}

		return (
			<div style={style}>
				<TabItem
					tab={tab}
					worktreeId={worktree.id}
					worktree={worktree}
					workspaceId={workspaceId}
					parentTabId={
						node.parent?.data.tab?.type === "group" ? node.parent.id : undefined
					}
					selectedTabId={selectedTabId}
					selectedTabIds={selectedTabIds}
					onTabSelect={(wtId, tabId, shiftKey) => {
						handleTabSelect(wtId, tabId, shiftKey);
					}}
					onTabRemove={handleTabRemove}
					onGroupTabs={handleGroupTabs}
					onMoveOutOfGroup={handleMoveOutOfGroup}
					onTabRename={handleTabRename}
				/>
			</div>
		);
	};

	return (
		<div className="space-y-0.5">
			{hasPortForwarding && (
				<WorktreePortsList worktree={worktree} workspaceId={workspaceId} />
			)}

			<div className="space-y-0.5" style={{ height: "400px" }}>
				<Tree
					data={treeData}
					width="100%"
					height={400}
					dndManager={dragDropManager}
					onMove={handleMove}
					onSelect={(nodes) => {
						if (nodes.length > 0) {
							const node = nodes[0];
							handleTabSelect(worktree.id, node.id, false);
						}
					}}
					onToggle={(id) => {
						const node = treeData.find((item) => item.id === id);
						if (node && node.tab.type === "group") {
							setExpandedGroupTabs((prev) => {
								const next = new Set(prev);
								if (next.has(id)) {
									next.delete(id);
								} else {
									next.add(id);
								}
								return next;
							});
						}
					}}
					openByDefault={false}
					initialOpenState={Object.fromEntries(
						treeData
							.filter(
								(item) =>
									item.tab.type === "group" && expandedGroupTabs.has(item.id),
							)
							.map((item) => [item.id, true]),
					)}
				>
					{renderNode}
				</Tree>
			</div>

			{/* Dialogs remain the same - keeping them for now */}
		</div>
	);
}
