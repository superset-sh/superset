import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	ChevronRight,
	Clipboard,
	ExternalLink,
	FolderOpen,
	GitBranch,
	GitMerge,
	Plus,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MosaicNode } from "react-mosaic-component";
import type { Tab, Worktree } from "shared/types";
import { TabItem } from "./components/TabItem";

// Sortable wrapper for tabs
function SortableTab({
	tab,
	worktreeId,
	parentTabId,
	selectedTabId,
	selectedTabIds,
	onTabSelect,
	onTabRemove,
	onGroupTabs,
	onMoveOutOfGroup,
}: {
	tab: Tab;
	worktreeId: string;
	parentTabId?: string; // Optional parent group tab ID
	selectedTabId?: string;
	selectedTabIds: Set<string>;
	onTabSelect: (worktreeId: string, tabId: string, shiftKey: boolean) => void;
	onTabRemove: (tabId: string) => void;
	onGroupTabs: (tabIds: string[]) => void;
	onMoveOutOfGroup: (tabId: string, parentTabId: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: tab.id,
		data: {
			type: "tab",
			parentTabId,
		},
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<TabItem
				tab={tab}
				worktreeId={worktreeId}
				parentTabId={parentTabId}
				selectedTabId={selectedTabId}
				selectedTabIds={selectedTabIds}
				onTabSelect={onTabSelect}
				onTabRemove={onTabRemove}
				onGroupTabs={onGroupTabs}
				onMoveOutOfGroup={onMoveOutOfGroup}
			/>
		</div>
	);
}

// Droppable wrapper for group tabs
function DroppableGroupTab({
	tab,
	worktreeId,
	selectedTabId,
	isExpanded,
	level,
	onToggle,
	onTabSelect,
	onUngroupTab,
	isOver,
}: {
	tab: Tab;
	worktreeId: string;
	selectedTabId?: string;
	isExpanded: boolean;
	level: number;
	onToggle: (groupTabId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string, shiftKey: boolean) => void;
	onUngroupTab: (groupTabId: string) => void;
	isOver: boolean;
}) {
	const { setNodeRef } = useDroppable({
		id: `group-${tab.id}`,
		data: {
			type: "group",
			groupTabId: tab.id,
		},
	});

	const isSelected = selectedTabId === tab.id;

	return (
		<div ref={setNodeRef}>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button
						type="button"
						onClick={(e) => {
							onTabSelect(worktreeId, tab.id, e.shiftKey);
							onToggle(tab.id);
						}}
						className={`group flex items-center gap-1 w-full h-8 px-3 text-sm rounded-md [transition:all_0.2s,border_0s] ${
							isSelected
								? "bg-neutral-800 border border-neutral-700"
								: isOver
									? "bg-blue-900/50 border border-blue-500"
									: "hover:bg-neutral-800/50"
						}`}
						style={{ paddingLeft: `${level * 12 + 12}px` }}
					>
						<ChevronRight
							size={12}
							className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
						/>
						<span className="truncate flex-1 text-left">{tab.name}</span>
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onClick={() => onUngroupTab(tab.id)}>
						<FolderOpen size={14} className="mr-2" />
						Ungroup Tabs
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</div>
	);
}

// Droppable area wrapper for the expanded group tab content
function DroppableGroupArea({
	groupTabId,
	isOver,
	children,
}: {
	groupTabId: string;
	isOver: boolean;
	children: React.ReactNode;
}) {
	const { setNodeRef } = useDroppable({
		id: `group-area-${groupTabId}`,
		data: {
			type: "group-area",
			groupTabId,
		},
	});

	return (
		<div
			ref={setNodeRef}
			className={`relative ${
				isOver ? "bg-blue-900/20 border-l-2 border-blue-500 rounded-r-md" : ""
			}`}
			style={{
				minHeight: "40px",
				transition: "all 0.2s",
			}}
		>
			{children}
			{isOver && (
				<div className="absolute inset-0 pointer-events-none flex items-center justify-center text-blue-400 text-xs font-medium">
					Drop here to add to group
				</div>
			)}
		</div>
	);
}

interface WorktreeItemProps {
	worktree: Worktree;
	workspaceId: string;
	isExpanded: boolean;
	onToggle: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
}

export function WorktreeItem({
	worktree,
	workspaceId,
	isExpanded,
	onToggle,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
}: WorktreeItemProps) {
	// Track active drag state
	const [activeId, setActiveId] = useState<string | null>(null);
	const [_overId, setOverId] = useState<string | null>(null);

	// Track expanded group tabs
	const [expandedGroupTabs, setExpandedGroupTabs] = useState<Set<string>>(
		new Set(),
	);

	// Track multi-selected tabs
	const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
	const [lastClickedTabId, setLastClickedTabId] = useState<string | null>(null);

	// Track if merge is disabled (when this is the active worktree)
	const [isMergeDisabled, setIsMergeDisabled] = useState(false);
	const [mergeDisabledReason, setMergeDisabledReason] = useState<string>("");
	const [targetBranch, setTargetBranch] = useState<string>("");

	// Auto-expand group tabs that contain the selected tab
	// biome-ignore lint/correctness/useExhaustiveDependencies: findParentGroupTab is stable
	useEffect(() => {
		if (!selectedTabId) return;

		const tabs = Array.isArray(worktree.tabs) ? worktree.tabs : [];
		const parentGroupTab = findParentGroupTab(tabs, selectedTabId);

		if (parentGroupTab) {
			setExpandedGroupTabs((prev) => {
				const next = new Set(prev);
				next.add(parentGroupTab.id);
				return next;
			});
		}
	}, [selectedTabId, worktree.tabs]);

	// Helper: recursively find a tab by ID
	const findTabById = (tabs: Tab[], tabId: string): Tab | null => {
		for (const tab of tabs) {
			if (tab.id === tabId) return tab;
			if (tab.type === "group" && tab.tabs) {
				const found = findTabById(tab.tabs, tabId);
				if (found) return found;
			}
		}
		return null;
	};

	// Helper: recursively find parent group tab containing a specific tab
	const findParentGroupTab = (tabs: Tab[], tabId: string): Tab | null => {
		for (const tab of tabs) {
			if (tab.type === "group" && tab.tabs) {
				if (tab.tabs.some((t) => t.id === tabId)) return tab;
				const found = findParentGroupTab(tab.tabs, tabId);
				if (found) return found;
			}
		}
		return null;
	};

	// Helper: recursively get all tabs as flat array with their parent IDs
	const getAllTabs = (
		tabs: Tab[],
		parentTabId?: string,
	): Array<{ tab: Tab; parentTabId?: string }> => {
		const result: Array<{ tab: Tab; parentTabId?: string }> = [];
		for (const tab of tabs) {
			result.push({ tab, parentTabId });
			if (tab.type === "group" && tab.tabs) {
				result.push(...getAllTabs(tab.tabs, tab.id));
			}
		}
		return result;
	};

	// Helper: get all non-group tabs at the same level (for shift-click range selection)
	const getTabsAtSameLevel = (
		tabs: Tab[],
		targetTabId: string,
		_parentTabId?: string,
	): Tab[] => {
		// Find which level the target tab is at
		for (const tab of tabs) {
			if (tab.id === targetTabId) {
				// Found at current level - return all tabs at this level (excluding groups)
				return tabs.filter((t) => t.type !== "group");
			}
			if (tab.type === "group" && tab.tabs) {
				const found = getTabsAtSameLevel(tab.tabs, targetTabId, tab.id);
				if (found.length > 0) return found;
			}
		}
		return [];
	};

	// Handle tab selection with shift-click support
	const handleTabSelect = (
		worktreeId: string,
		tabId: string,
		shiftKey: boolean,
	) => {
		if (shiftKey && lastClickedTabId) {
			// Shift-click: select range
			const tabsAtLevel = getTabsAtSameLevel(tabs, tabId);
			const lastIndex = tabsAtLevel.findIndex((t) => t.id === lastClickedTabId);
			const currentIndex = tabsAtLevel.findIndex((t) => t.id === tabId);

			if (lastIndex !== -1 && currentIndex !== -1) {
				const start = Math.min(lastIndex, currentIndex);
				const end = Math.max(lastIndex, currentIndex);
				const rangeTabIds = tabsAtLevel.slice(start, end + 1).map((t) => t.id);

				setSelectedTabIds(new Set(rangeTabIds));
			}
		} else {
			// Normal click: single selection
			setSelectedTabIds(new Set([tabId]));
			setLastClickedTabId(tabId);
		}

		// Always update the main selected tab
		onTabSelect(worktreeId, tabId);
	};

	// Handle grouping selected tabs
	const handleGroupTabs = async (tabIds: string[]) => {
		try {
			// Create a new group tab
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

			// Move each selected tab into the group
			for (const tabId of tabIds) {
				const tab = findTabById(tabs, tabId);
				if (!tab || tab.type === "group") continue; // Skip group tabs

				// Use tab-move to move the tab into the group
				await window.ipcRenderer.invoke("tab-move", {
					workspaceId,
					worktreeId: worktree.id,
					tabId,
					targetParentTabId: groupTabId,
					targetIndex: 0, // Add to end
				});
			}

			// Reload to show the updated structure
			onReload();

			// Expand the new group tab to show its contents
			setExpandedGroupTabs((prev) => new Set(prev).add(groupTabId));

			// Select the new group tab
			onTabSelect(worktree.id, groupTabId);

			// Clear selection
			setSelectedTabIds(new Set());
			setLastClickedTabId(null);
		} catch (error) {
			console.error("Error grouping tabs:", error);
		}
	};

	// Handle ungrouping a group tab
	const handleUngroupTab = async (groupTabId: string) => {
		try {
			const groupTab = findTabById(tabs, groupTabId);
			if (!groupTab || groupTab.type !== "group" || !groupTab.tabs) {
				console.error("Invalid group tab");
				return;
			}

			// Move each child tab back to the worktree level
			for (const childTab of groupTab.tabs) {
				await window.ipcRenderer.invoke("tab-move", {
					workspaceId,
					worktreeId: worktree.id,
					tabId: childTab.id,
					sourceParentTabId: groupTabId, // Move from the group
					targetParentTabId: undefined, // Move to worktree level
					targetIndex: 0, // Add to end of worktree tabs
				});
			}

			// Delete the now-empty group tab
			await window.ipcRenderer.invoke("tab-delete", {
				workspaceId,
				worktreeId: worktree.id,
				tabId: groupTabId,
			});

			// Reload to show the updated structure
			onReload();
		} catch (error) {
			console.error("Error ungrouping tab:", error);
		}
	};

	// Handle moving a tab out of its group
	const handleMoveOutOfGroup = async (tabId: string, parentTabId: string) => {
		try {
			const tab = findTabById(tabs, tabId);
			const parentTab = findTabById(tabs, parentTabId);

			if (!tab || !parentTab || parentTab.type !== "group") {
				console.error("Invalid tab or parent group");
				return;
			}

			// Move the tab to worktree level
			const moveResult = await window.ipcRenderer.invoke("tab-move", {
				workspaceId,
				worktreeId: worktree.id,
				tabId,
				sourceParentTabId: parentTabId,
				targetParentTabId: undefined, // Move to worktree level
				targetIndex: tabs.length, // Add to end of worktree tabs
			});

			if (!moveResult.success) {
				console.error("Failed to move tab out of group:", moveResult.error);
				onReload();
				return;
			}

			// Update the parent group's mosaic tree to remove this tab
			if (parentTab.mosaicTree) {
				const updatedMosaicTree = removeTabFromMosaicTree(
					parentTab.mosaicTree,
					tabId,
				);

				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId,
					worktreeId: worktree.id,
					tabId: parentTabId,
					mosaicTree: updatedMosaicTree,
				});
			}

			// Reload to show the updated structure
			// Note: Backend automatically cleans up empty groups via cleanupEmptyGroupsInWorktree()
			onReload();

			// Select the moved tab
			onTabSelect(worktree.id, tabId);
		} catch (error) {
			console.error("Error moving tab out of group:", error);
		}
	};

	// Check if merge should be disabled on mount and get target branch
	useEffect(() => {
		const checkMergeStatus = async () => {
			// Get the workspace to find the active worktree
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				const activeWorktree = workspace.worktrees.find(
					(wt: { id: string }) => wt.id === workspace.activeWorktreeId,
				);
				if (activeWorktree) {
					setTargetBranch(activeWorktree.branch);
				}
			}

			const canMergeResult = await window.ipcRenderer.invoke(
				"worktree-can-merge",
				{
					workspaceId,
					worktreeId: worktree.id,
				},
			);

			if (canMergeResult.isActiveWorktree) {
				setIsMergeDisabled(true);
				setMergeDisabledReason(canMergeResult.reason || "Active worktree");
			} else {
				setIsMergeDisabled(false);
				setMergeDisabledReason("");
			}
		};

		checkMergeStatus();
	}, [workspaceId, worktree.id]);

	// Configure sensors for drag-and-drop
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragOver = (event: DragOverEvent) => {
		setOverId(event.over?.id as string | null);
	};

	// Helper: Add tab ID to mosaic tree
	const addTabToMosaicTree = (
		tree: MosaicNode<string> | null | undefined,
		tabId: string,
	): MosaicNode<string> => {
		if (!tree) {
			return tabId;
		}

		if (typeof tree === "string") {
			// Single tab - create a split
			return {
				direction: "row",
				first: tree,
				second: tabId,
				splitPercentage: 50,
			};
		}

		// Tree node - add to the second branch
		return {
			...tree,
			second: addTabToMosaicTree(tree.second, tabId),
		};
	};

	// Helper: Remove tab ID from mosaic tree
	const removeTabFromMosaicTree = (
		tree: MosaicNode<string>,
		tabId: string,
	): MosaicNode<string> | null => {
		if (typeof tree === "string") {
			// If this is the tab to remove, return null
			return tree === tabId ? null : tree;
		}

		// Recursively remove from branches
		const newFirst = removeTabFromMosaicTree(tree.first, tabId);
		const newSecond = removeTabFromMosaicTree(tree.second, tabId);

		// If both branches are gone, return null
		if (!newFirst && !newSecond) {
			return null;
		}

		// If one branch is gone, return the other
		if (!newFirst) {
			return newSecond;
		}
		if (!newSecond) {
			return newFirst;
		}

		// Both branches exist, return the updated tree
		return {
			...tree,
			first: newFirst,
			second: newSecond,
		};
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);
		setOverId(null);

		if (!over || active.id === over.id) {
			return;
		}

		const activeData = active.data.current;
		const overData = over.data.current;

		// Only handle tab dragging
		if (activeData?.type !== "tab") {
			return;
		}

		try {
			const activeParentTabId = activeData.parentTabId;
			const overParentTabId = overData?.parentTabId;

			// Dropping onto a group tab or group area
			if (overData?.type === "group" || overData?.type === "group-area") {
				const draggedTabId = active.id as string;
				const groupTabId = overData.groupTabId as string;

				// Don't allow dropping a tab onto its own parent
				if (activeParentTabId === groupTabId) {
					return;
				}

				// Get the dragged tab and group tab
				const draggedTab = findTabById(tabs, draggedTabId);
				const groupTab = findTabById(tabs, groupTabId);

				if (!draggedTab || !groupTab || groupTab.type !== "group") {
					console.error("Invalid tab or group tab");
					return;
				}

				// Move the tab into the group
				const moveResult = await window.ipcRenderer.invoke("tab-move", {
					workspaceId,
					worktreeId: worktree.id,
					tabId: draggedTabId,
					sourceParentTabId: activeParentTabId,
					targetParentTabId: groupTabId,
					targetIndex: groupTab.tabs?.length || 0,
				});

				if (!moveResult.success) {
					console.error("Failed to move tab:", moveResult.error);
					onReload();
					return;
				}

				// Update the mosaic tree to include the new tab
				const updatedMosaicTree = addTabToMosaicTree(
					groupTab.mosaicTree,
					draggedTabId,
				);

				const treeResult = await window.ipcRenderer.invoke(
					"tab-update-mosaic-tree",
					{
						workspaceId,
						worktreeId: worktree.id,
						tabId: groupTabId,
						mosaicTree: updatedMosaicTree,
					},
				);

				if (!treeResult.success) {
					console.error("Failed to update mosaic tree:", treeResult.error);
				}

				// Reload to show the updated structure
				onReload();

				// Expand the group tab to show the newly added tab
				setExpandedGroupTabs((prev) => new Set(prev).add(groupTabId));

				// Select the group tab to show the mosaic layout
				onTabSelect(worktree.id, groupTabId);

				return;
			}

			// Reordering within the same parent group
			if (overData?.type === "tab" && activeParentTabId === overParentTabId) {
				const parentTab = activeParentTabId
					? findTabById(tabs, activeParentTabId)
					: null;

				// If no parent, we're reordering top-level tabs
				const tabsArray = parentTab?.tabs || tabs;

				const oldIndex = tabsArray.findIndex((t) => t.id === active.id);
				const newIndex = tabsArray.findIndex((t) => t.id === over.id);

				if (oldIndex === -1 || newIndex === -1) return;

				// Optimistic update
				const reorderedTabs = arrayMove(tabsArray, oldIndex, newIndex);

				// Update worktree state
				let updatedWorktree: Worktree;
				if (parentTab) {
					// Update nested tabs
					const updateTabsRecursive = (tabs: Tab[]): Tab[] => {
						return tabs.map((tab) => {
							if (tab.id === parentTab.id) {
								return { ...tab, tabs: reorderedTabs };
							}
							if (tab.type === "group" && tab.tabs) {
								return { ...tab, tabs: updateTabsRecursive(tab.tabs) };
							}
							return tab;
						});
					};
					updatedWorktree = {
						...worktree,
						tabs: updateTabsRecursive(worktree.tabs),
					};
				} else {
					// Update top-level tabs
					updatedWorktree = { ...worktree, tabs: reorderedTabs };
				}

				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const newOrder = reorderedTabs.map((t) => t.id);
				const result = await window.ipcRenderer.invoke("tab-reorder", {
					workspaceId,
					worktreeId: worktree.id,
					parentTabId: activeParentTabId,
					tabIds: newOrder,
				});

				if (!result.success) {
					console.error("Failed to reorder tabs:", result.error);
					onReload();
				}
			}
			// Moving to a different parent group (dragging into a group by hovering over its child tabs)
			else if (
				overData?.type === "tab" &&
				activeParentTabId !== overParentTabId
			) {
				const draggedTabId = active.id as string;
				const targetParentTabId = overParentTabId;

				// If dropping onto a child of a group, move into that group
				if (targetParentTabId) {
					const draggedTab = findTabById(tabs, draggedTabId);
					const targetGroupTab = findTabById(tabs, targetParentTabId);

					if (
						!draggedTab ||
						!targetGroupTab ||
						targetGroupTab.type !== "group"
					) {
						console.error("Invalid tab or target group");
						return;
					}

					// Move the tab into the group
					const moveResult = await window.ipcRenderer.invoke("tab-move", {
						workspaceId,
						worktreeId: worktree.id,
						tabId: draggedTabId,
						sourceParentTabId: activeParentTabId,
						targetParentTabId: targetParentTabId,
						targetIndex: targetGroupTab.tabs?.length || 0,
					});

					if (!moveResult.success) {
						console.error("Failed to move tab:", moveResult.error);
						onReload();
						return;
					}

					// Update the mosaic tree to include the new tab
					const updatedMosaicTree = addTabToMosaicTree(
						targetGroupTab.mosaicTree,
						draggedTabId,
					);

					const treeResult = await window.ipcRenderer.invoke(
						"tab-update-mosaic-tree",
						{
							workspaceId,
							worktreeId: worktree.id,
							tabId: targetParentTabId,
							mosaicTree: updatedMosaicTree,
						},
					);

					if (!treeResult.success) {
						console.error("Failed to update mosaic tree:", treeResult.error);
					}

					// Reload to show the updated structure
					onReload();

					// Expand the group tab to show the newly added tab
					setExpandedGroupTabs((prev) => new Set(prev).add(targetParentTabId));

					// Select the group tab to show the mosaic layout
					onTabSelect(worktree.id, targetParentTabId);
				}
			}
		} catch (error) {
			console.error("Error during drag end:", error);
		}
	};

	// Get active item for drag overlay
	const activeItem = activeId ? findTabById(worktree.tabs, activeId) : null;

	// Context menu handlers
	const handleCopyPath = async () => {
		const path = await window.ipcRenderer.invoke("worktree-get-path", {
			workspaceId,
			worktreeId: worktree.id,
		});
		if (path) {
			navigator.clipboard.writeText(path);
		}
	};

	const handleRemoveWorktree = async () => {
		if (
			confirm(
				`Are you sure you want to remove the worktree "${worktree.branch}"?`,
			)
		) {
			const result = await window.ipcRenderer.invoke("worktree-remove", {
				workspaceId,
				worktreeId: worktree.id,
			});

			if (result.success) {
				onReload();
			} else {
				alert(`Failed to remove worktree: ${result.error}`);
			}
		}
	};

	const handleMergeWorktree = async () => {
		// Check if can merge first
		const canMergeResult = await window.ipcRenderer.invoke(
			"worktree-can-merge",
			{
				workspaceId,
				worktreeId: worktree.id,
			},
		);

		if (!canMergeResult.canMerge) {
			alert(`Cannot merge: ${canMergeResult.reason || "Unknown error"}`);
			return;
		}

		const branchText = targetBranch
			? ` into "${targetBranch}"`
			: " into the active worktree";

		// Build confirmation message with warning if there are uncommitted changes
		let confirmMessage = `Are you sure you want to merge "${worktree.branch}"${branchText}?`;
		if (canMergeResult.hasUncommittedChanges) {
			confirmMessage +=
				"\n\nWarning: The target worktree has uncommitted changes. The merge will proceed anyway.";
		}

		if (confirm(confirmMessage)) {
			const result = await window.ipcRenderer.invoke("worktree-merge", {
				workspaceId,
				worktreeId: worktree.id,
			});

			if (result.success) {
				alert("Merge successful!");
				onReload();
			} else {
				alert(`Failed to merge: ${result.error}`);
			}
		}
	};

	const handleOpenInCursor = async () => {
		const path = await window.ipcRenderer.invoke("worktree-get-path", {
			workspaceId,
			worktreeId: worktree.id,
		});
		if (path) {
			// Use Cursor's deeplink protocol: cursor://file/{path}
			await window.ipcRenderer.invoke("open-external", `cursor://file/${path}`);
		}
	};

	const handleAddTab = async () => {
		// Get the first top-level group tab
		const _firstGroupTab = worktree.tabs.find((t) => t.type === "group");
		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId,
				worktreeId: worktree.id,
				// No parentTabId - create at worktree level
				name: `Terminal ${worktree.tabs.length + 1}`,
				type: "terminal",
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				// Auto-select the new tab first (before reload)
				if (newTabId) {
					handleTabSelect(worktree.id, newTabId, false);
				}
				onReload();
			} else {
				console.error("Failed to create tab:", result.error);
			}
		} catch (error) {
			console.error("Error creating tab:", error);
		}
	};

	const handleTabRemove = async (tabId: string) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-delete", {
				workspaceId,
				worktreeId: worktree.id,
				tabId,
			});

			if (result.success) {
				// Backend automatically cleans up empty groups via cleanupEmptyGroupsInWorktree()
				onReload(); // Refresh the workspace to show the updated tab list
			} else {
				console.error("Failed to delete tab:", result.error);
			}
		} catch (error) {
			console.error("Error deleting tab:", error);
		}
	};

	// Get all tabs for sortable context (including nested)
	// Defensive: ensure worktree.tabs exists and is an array
	const tabs = Array.isArray(worktree.tabs) ? worktree.tabs : [];
	const allTabsFlat = getAllTabs(tabs);
	const allTabIds = allTabsFlat.map((item) => item.tab.id);

	// Toggle group tab expansion
	const toggleGroupTab = (groupTabId: string) => {
		setExpandedGroupTabs((prev) => {
			const next = new Set(prev);
			if (next.has(groupTabId)) {
				next.delete(groupTabId);
			} else {
				next.add(groupTabId);
			}
			return next;
		});
	};

	// Render a single tab or group tab with nesting
	const renderTab = (tab: Tab, parentTabId?: string, level = 0) => {
		if (tab.type === "group") {
			const isExpanded = expandedGroupTabs.has(tab.id);
			const isOver = _overId === `group-${tab.id}`;
			const isAreaOver = _overId === `group-area-${tab.id}`;
			return (
				<div key={tab.id} className="space-y-1">
					{/* Group Tab Header */}
					<DroppableGroupTab
						tab={tab}
						worktreeId={worktree.id}
						selectedTabId={selectedTabId}
						isExpanded={isExpanded}
						level={level}
						onToggle={toggleGroupTab}
						onTabSelect={handleTabSelect}
						onUngroupTab={handleUngroupTab}
						isOver={isOver}
					/>

					{/* Nested Tabs - Make the entire area droppable */}
					{isExpanded && tab.tabs && (
						<DroppableGroupArea groupTabId={tab.id} isOver={isAreaOver}>
							<div className="space-y-1">
								{tab.tabs.map((childTab) =>
									renderTab(childTab, tab.id, level + 1),
								)}
							</div>
						</DroppableGroupArea>
					)}
				</div>
			);
		}

		// Regular tab (terminal, editor, etc.)
		return (
			<div key={tab.id} style={{ paddingLeft: `${level * 12}px` }}>
				<SortableTab
					tab={tab}
					worktreeId={worktree.id}
					parentTabId={parentTabId}
					selectedTabId={selectedTabId}
					selectedTabIds={selectedTabIds}
					onTabSelect={handleTabSelect}
					onTabRemove={handleTabRemove}
					onGroupTabs={handleGroupTabs}
					onMoveOutOfGroup={handleMoveOutOfGroup}
				/>
			</div>
		);
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<div className="space-y-1">
				{/* Worktree Header */}
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onToggle(worktree.id)}
							className="w-full h-8 px-3 pb-1 font-normal"
							style={{ justifyContent: "flex-start" }}
						>
							<ChevronRight
								size={12}
								className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
							/>
							<GitBranch size={14} className="opacity-70" />
							<span className="truncate flex-1 text-left">
								{worktree.branch}
							</span>
						</Button>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem
							onClick={handleMergeWorktree}
							disabled={isMergeDisabled}
						>
							<GitMerge size={14} className="mr-2" />
							{isMergeDisabled
								? `Merge Worktree (${mergeDisabledReason})`
								: targetBranch
									? `Merge into (${targetBranch})`
									: "Merge into Active Worktree"}
						</ContextMenuItem>
						<ContextMenuItem onClick={handleCopyPath}>
							<Clipboard size={14} className="mr-2" />
							Copy Path
						</ContextMenuItem>
						<ContextMenuItem onClick={handleOpenInCursor}>
							<ExternalLink size={14} className="mr-2" />
							Open in Cursor
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onClick={handleRemoveWorktree}
							variant="destructive"
						>
							<Trash2 size={14} className="mr-2" />
							Remove Worktree
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>

				{/* Tabs List */}
				{isExpanded && (
					<div className="ml-6 space-y-1">
						{/* Render tabs with collapsible groups */}
						<SortableContext
							items={allTabIds}
							strategy={verticalListSortingStrategy}
						>
							{tabs.map((tab) => renderTab(tab, undefined, 0))}
						</SortableContext>

						{/* New Tab Button */}
						<Button
							variant="ghost"
							size="sm"
							onClick={handleAddTab}
							className="w-full h-8 px-3 font-normal opacity-70 hover:opacity-100"
							style={{ justifyContent: "flex-start" }}
						>
							<Plus size={14} />
							<span className="truncate">New Tab</span>
						</Button>
					</div>
				)}
			</div>

			{/* Drag Overlay - follows the cursor */}
			<DragOverlay>
				{activeItem ? (
					<div className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm opacity-90 cursor-grabbing">
						{activeItem.name}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
