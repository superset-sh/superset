import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	ChevronRight,
	Clipboard,
	Edit2,
	ExternalLink,
	FolderOpen,
	GitBranch,
	GitMerge,
	Monitor,
	Plus,
	Settings,
	Star,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MosaicNode } from "react-mosaic-component";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "renderer/components/ui/dialog";
import type { Tab, Worktree } from "shared/types";
import { WorktreePortsList } from "../WorktreePortsList";
import { GitStatusDialog } from "./components/GitStatusDialog";
import { TabItem } from "./components/TabItem";

interface ProxyStatus {
	canonical: number;
	target?: number;
	service?: string;
	active: boolean;
}

// Sortable wrapper for tabs
function SortableTab({
	tab,
	worktreeId,
	worktree,
	workspaceId,
	parentTabId,
	selectedTabId,
	selectedTabIds,
	onTabSelect,
	onTabRemove,
	onGroupTabs,
	onMoveOutOfGroup,
	onTabRename,
}: {
	tab: Tab;
	worktreeId: string;
	worktree: Worktree;
	workspaceId: string;
	parentTabId?: string; // Optional parent group tab ID
	selectedTabId?: string;
	selectedTabIds: Set<string>;
	onTabSelect: (worktreeId: string, tabId: string, shiftKey: boolean) => void;
	onTabRemove: (tabId: string) => void;
	onGroupTabs: (tabIds: string[]) => void;
	onMoveOutOfGroup: (tabId: string, parentTabId: string) => void;
	onTabRename: (tabId: string, newName: string) => void;
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
			worktreeId,
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
				worktree={worktree}
				workspaceId={workspaceId}
				parentTabId={parentTabId}
				selectedTabId={selectedTabId}
				selectedTabIds={selectedTabIds}
				onTabSelect={onTabSelect}
				onTabRemove={onTabRemove}
				onGroupTabs={onGroupTabs}
				onMoveOutOfGroup={onMoveOutOfGroup}
				onTabRename={onTabRename}
			/>
		</div>
	);
}

// Droppable wrapper for group tabs
function DroppableGroupTab({
	tab,
	worktreeId,
	workspaceId,
	selectedTabId,
	isExpanded,
	level,
	onToggle,
	onTabSelect,
	onUngroupTab,
	onRenameGroup,
	isOver,
}: {
	tab: Tab;
	worktreeId: string;
	workspaceId: string;
	selectedTabId?: string;
	isExpanded: boolean;
	level: number;
	onToggle: (groupTabId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string, shiftKey: boolean) => void;
	onUngroupTab: (groupTabId: string) => void;
	onRenameGroup: (groupTabId: string, newName: string) => void;
	isOver: boolean;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(tab.name);
	const inputRef = useRef<HTMLInputElement>(null);

	const { setNodeRef } = useDroppable({
		id: `group-${tab.id}`,
		data: {
			type: "group",
			groupTabId: tab.id,
		},
	});

	// Focus input when entering edit mode
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const isSelected = selectedTabId === tab.id;

	const handleClick = (e: React.MouseEvent) => {
		if (!isEditing) {
			onTabSelect(worktreeId, tab.id, e.shiftKey);
			onToggle(tab.id);
		}
	};

	const handleStartRename = () => {
		setEditName(tab.name);
		setIsEditing(true);
	};

	const handleSaveRename = () => {
		const trimmedName = editName.trim();
		if (trimmedName !== "" && trimmedName !== tab.name) {
			onRenameGroup(tab.id, trimmedName);
		}
		setIsEditing(false);
	};

	const handleCancelRename = () => {
		setEditName(tab.name);
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSaveRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			handleCancelRename();
		}
	};

	return (
		<div ref={setNodeRef}>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
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
							className={`transition-transform ${isExpanded ? "rotate-90" : ""} shrink-0`}
						/>
						{isEditing ? (
							<input
								ref={inputRef}
								type="text"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								onBlur={handleSaveRename}
								onKeyDown={handleKeyDown}
								onClick={(e) => e.stopPropagation()}
								className="flex-1 bg-neutral-700 text-white px-2 py-0.5 rounded-sm text-sm outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
							/>
						) : (
							<span className="truncate flex-1 text-left">{tab.name}</span>
						)}
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onClick={handleStartRename}>
						<Edit2 size={14} className="mr-2" />
						Rename
					</ContextMenuItem>
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
	activeWorktreeId: string | null;
	mainBranch: string;
	isExpanded: boolean;
	onToggle: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
	hasPortForwarding?: boolean;
	onCloneWorktree: () => void;
}

export function WorktreeItem({
	worktree,
	workspaceId,
	activeWorktreeId,
	mainBranch,
	isExpanded,
	onToggle,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
	hasPortForwarding = false,
	onCloneWorktree,
}: WorktreeItemProps) {
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
	const [targetWorktreeId, setTargetWorktreeId] = useState<string>("");
	const [targetBranch, setTargetBranch] = useState<string>("");
	const [availableWorktrees, setAvailableWorktrees] = useState<
		Array<{ id: string; branch: string }>
	>([]);

	// Dialog states
	const [showRemoveDialog, setShowRemoveDialog] = useState(false);
	const [showMergeDialog, setShowMergeDialog] = useState(false);
	const [showErrorDialog, setShowErrorDialog] = useState(false);
	const [showGitStatusDialog, setShowGitStatusDialog] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [errorTitle, setErrorTitle] = useState("");
	const [mergeWarning, setMergeWarning] = useState("");
	const [removeWarning, setRemoveWarning] = useState("");

	// Track if this worktree is active
	const isActive = activeWorktreeId === worktree.id;

	// Effect: Log when worktree becomes active/inactive
	useEffect(() => {
		console.log(
			`[WorktreeItem] Worktree ${worktree.branch} (${worktree.id}) active state: ${isActive}`,
		);
	}, [isActive, worktree.branch, worktree.id]);

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

	// Handle renaming a group tab
	const handleRenameGroup = async (groupTabId: string, newName: string) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-update-name", {
				workspaceId,
				worktreeId: worktree.id,
				tabId: groupTabId,
				name: newName,
			});

			if (result.success) {
				// Optimistically update the local worktree data
				const updatedTabs = updateTabNameRecursive(
					worktree.tabs,
					groupTabId,
					newName,
				);
				const updatedWorktree = { ...worktree, tabs: updatedTabs };
				onUpdateWorktree(updatedWorktree);
			} else {
				alert(`Failed to rename group: ${result.error}`);
			}
		} catch (error) {
			console.error("Error renaming group:", error);
			alert("Failed to rename group");
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

	// Load available worktrees on mount
	useEffect(() => {
		const loadWorktrees = async () => {
			// Get the workspace to find available worktrees
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				// Get all worktrees except the current one
				const otherWorktrees = workspace.worktrees
					.filter((wt: { id: string }) => wt.id !== worktree.id)
					.map((wt: { id: string; branch: string }) => ({
						id: wt.id,
						branch: wt.branch,
					}));
				setAvailableWorktrees(otherWorktrees);

				// Disable merge only if there are no other worktrees to merge into
				if (otherWorktrees.length === 0) {
					setIsMergeDisabled(true);
					setMergeDisabledReason("No other worktrees available");
				} else {
					setIsMergeDisabled(false);
					setMergeDisabledReason("");

					// Set default target to active worktree if it exists and is not this worktree
					const activeWorktree = workspace.worktrees.find(
						(wt: { id: string }) => wt.id === workspace.activeWorktreeId,
					);
					if (activeWorktree && activeWorktree.id !== worktree.id) {
						setTargetWorktreeId(activeWorktree.id);
						setTargetBranch(activeWorktree.branch);
					} else if (otherWorktrees.length > 0) {
						// If active worktree is this worktree, default to first available worktree
						setTargetWorktreeId(otherWorktrees[0].id);
						setTargetBranch(otherWorktrees[0].branch);
					}
				}
			}
		};

		loadWorktrees();
	}, [workspaceId, worktree.id, activeWorktreeId]);

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
		// Check if the worktree has uncommitted changes
		const canRemoveResult = await window.ipcRenderer.invoke(
			"worktree-can-remove",
			{
				workspaceId,
				worktreeId: worktree.id,
			},
		);

		// Build warning message if there are uncommitted changes
		let warning = "";
		if (canRemoveResult.hasUncommittedChanges) {
			warning = `Warning: This worktree (${worktree.branch}) has uncommitted changes. Removing it will delete these changes permanently.`;
		}

		setRemoveWarning(warning);
		setShowRemoveDialog(true);
	};

	const confirmRemoveWorktree = async () => {
		setShowRemoveDialog(false);
		setRemoveWarning("");

		const result = await window.ipcRenderer.invoke("worktree-remove", {
			workspaceId,
			worktreeId: worktree.id,
		});

		if (result.success) {
			// Backend removes from config first, then git worktree in background
			// This provides immediate UI feedback
			onReload();
		} else {
			setErrorTitle("Failed to Remove Worktree");
			setErrorMessage(
				result.error ||
					"An unknown error occurred while removing the worktree.",
			);
			setShowErrorDialog(true);
		}
	};

	const handleMergeWorktree = async () => {
		// Check if can merge with the selected target
		const canMergeResult = await window.ipcRenderer.invoke(
			"worktree-can-merge",
			{
				workspaceId,
				worktreeId: worktree.id,
				targetWorktreeId: targetWorktreeId || undefined,
			},
		);

		if (!canMergeResult.canMerge) {
			setErrorTitle("Cannot Merge");
			setErrorMessage(canMergeResult.reason || "Unknown error");
			setShowErrorDialog(true);
			return;
		}

		// Build warning message if there are uncommitted changes
		let warning = "";
		const warnings = [];

		if (canMergeResult.targetHasUncommittedChanges) {
			const targetBranchText = targetBranch ? ` (${targetBranch})` : "";
			warnings.push(
				`The target worktree${targetBranchText} has uncommitted changes.`,
			);
		}

		if (canMergeResult.sourceHasUncommittedChanges) {
			warnings.push(
				`The source worktree (${worktree.branch}) has uncommitted changes.`,
			);
		}

		if (warnings.length > 0) {
			warning = `Warning: ${warnings.join(" ")} The merge will proceed anyway.`;
		}

		setMergeWarning(warning);
		setShowMergeDialog(true);
	};

	// Handler for when target worktree changes
	const handleTargetWorktreeChange = async (newTargetId: string) => {
		setTargetWorktreeId(newTargetId);

		// Update target branch display
		const targetWorktree = availableWorktrees.find(
			(wt) => wt.id === newTargetId,
		);
		if (targetWorktree) {
			setTargetBranch(targetWorktree.branch);
		}

		// Re-check merge status with new target
		const canMergeResult = await window.ipcRenderer.invoke(
			"worktree-can-merge",
			{
				workspaceId,
				worktreeId: worktree.id,
				targetWorktreeId: newTargetId,
			},
		);

		// Update warning message
		let warning = "";
		const warnings = [];

		if (canMergeResult.targetHasUncommittedChanges) {
			const targetBranchText = targetWorktree?.branch
				? ` (${targetWorktree.branch})`
				: "";
			warnings.push(
				`The target worktree${targetBranchText} has uncommitted changes.`,
			);
		}

		if (canMergeResult.sourceHasUncommittedChanges) {
			warnings.push(
				`The source worktree (${worktree.branch}) has uncommitted changes.`,
			);
		}

		if (warnings.length > 0) {
			warning = `Warning: ${warnings.join(" ")} The merge will proceed anyway.`;
		}

		setMergeWarning(warning);
	};

	const confirmMergeWorktree = async () => {
		setShowMergeDialog(false);
		setMergeWarning("");

		const result = await window.ipcRenderer.invoke("worktree-merge", {
			workspaceId,
			worktreeId: worktree.id,
			targetWorktreeId: targetWorktreeId || undefined,
		});

		if (result.success) {
			onReload();
		} else {
			setErrorTitle("Failed to Merge");
			setErrorMessage(
				result.error || "An unknown error occurred while merging the worktree.",
			);
			setShowErrorDialog(true);
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

	const handleOpenSettings = async () => {
		// First, check if settings folder exists
		const checkResult = await window.ipcRenderer.invoke(
			"worktree-check-settings",
			{
				workspaceId,
				worktreeId: worktree.id,
			},
		);

		if (!checkResult.success) {
			setErrorTitle("Failed to Check Settings");
			setErrorMessage(
				checkResult.error ||
					"An unknown error occurred while checking settings.",
			);
			setShowErrorDialog(true);
			return;
		}

		// Open (and create if needed)
		const result = await window.ipcRenderer.invoke("worktree-open-settings", {
			workspaceId,
			worktreeId: worktree.id,
			createIfMissing: true,
		});

		if (result.success && result.created) {
			console.log(".superset folder created and opened in Cursor");
		} else if (!result.success) {
			setErrorTitle("Failed to Open Settings");
			setErrorMessage(
				result.error || "An unknown error occurred while opening settings.",
			);
			setShowErrorDialog(true);
		}
	};

	const handleAddTab = async () => {
		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId,
				worktreeId: worktree.id,
				// No parentTabId - create at worktree level
				name: "New Terminal",
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

	const handleAddPreview = async () => {
		try {
			const previewTabs = Array.isArray(worktree.tabs)
				? worktree.tabs.filter((tab) => tab.type === "preview")
				: [];
			const previewIndex = previewTabs.length + 1;

			const detectedPorts = worktree.detectedPorts || {};
			const portEntries = Object.entries(detectedPorts);

			let initialUrl: string | undefined;
			let previewLabel =
				previewIndex > 1 ? `Preview ${previewIndex}` : "Preview";

			if (portEntries.length > 0) {
				const [service, port] = portEntries[0];

				try {
					const status = (await window.ipcRenderer.invoke(
						"proxy-get-status",
					)) as ProxyStatus[];
					const activeProxies = (status || []).filter(
						(item) => item.active && typeof item.target === "number",
					);
					const proxyMap = new Map(
						activeProxies.map((item) => [
							item.target as number,
							item.canonical,
						]),
					);

					const canonicalPort = proxyMap.get(port);
					const resolvedPort = canonicalPort ?? port;
					initialUrl = `http://localhost:${resolvedPort}`;
				} catch (error) {
					console.error("Failed to determine proxied port:", error);
					initialUrl = `http://localhost:${port}`;
				}

				if (service) {
					previewLabel =
						previewIndex > 1
							? `Preview ${previewIndex} – ${service}`
							: `Preview – ${service}`;
				}
			}

			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId,
				worktreeId: worktree.id,
				name: previewLabel,
				type: "preview",
				url: initialUrl,
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				if (newTabId) {
					handleTabSelect(worktree.id, newTabId, false);
				}
				onReload();
			} else {
				console.error("Failed to create preview tab:", result.error);
			}
		} catch (error) {
			console.error("Error creating preview tab:", error);
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

	const handleTabRename = async (tabId: string, newName: string) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-update-name", {
				workspaceId,
				worktreeId: worktree.id,
				tabId,
				name: newName,
			});

			if (result.success) {
				// Optimistically update the local worktree data
				const updatedTabs = updateTabNameRecursive(
					worktree.tabs,
					tabId,
					newName,
				);
				const updatedWorktree = { ...worktree, tabs: updatedTabs };
				onUpdateWorktree(updatedWorktree);
			} else {
				alert(`Failed to rename tab: ${result.error}`);
			}
		} catch (error) {
			console.error("Error renaming tab:", error);
			alert("Failed to rename tab");
		}
	};

	// Helper to recursively update tab name
	const updateTabNameRecursive = (
		tabs: Tab[],
		tabId: string,
		newName: string,
	): Tab[] => {
		return tabs.map((tab) => {
			if (tab.id === tabId) {
				return { ...tab, name: newName };
			}
			if (tab.type === "group" && tab.tabs) {
				return {
					...tab,
					tabs: updateTabNameRecursive(tab.tabs, tabId, newName),
				};
			}
			return tab;
		});
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
			return (
				<div key={tab.id} className="space-y-1">
					{/* Group Tab Header */}
					<DroppableGroupTab
						tab={tab}
						worktreeId={worktree.id}
						workspaceId={workspaceId}
						selectedTabId={selectedTabId}
						isExpanded={isExpanded}
						level={level}
						onToggle={toggleGroupTab}
						onTabSelect={handleTabSelect}
						onUngroupTab={handleUngroupTab}
						onRenameGroup={handleRenameGroup}
						isOver={false}
					/>

					{/* Nested Tabs - Make the entire area droppable */}
					{isExpanded && tab.tabs && (
						<DroppableGroupArea groupTabId={tab.id} isOver={false}>
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
					worktree={worktree}
					workspaceId={workspaceId}
					parentTabId={parentTabId}
					selectedTabId={selectedTabId}
					selectedTabIds={selectedTabIds}
					onTabSelect={handleTabSelect}
					onTabRemove={handleTabRemove}
					onGroupTabs={handleGroupTabs}
					onMoveOutOfGroup={handleMoveOutOfGroup}
					onTabRename={handleTabRename}
				/>
			</div>
		);
	};

	return (
		<div className="space-y-1">
			{/* Worktree Header */}
			<Tooltip>
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onToggle(worktree.id)}
								className="group w-full h-8 px-3 pb-1 font-normal relative"
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
								{worktree.branch === mainBranch && (
									<Star
										size={14}
										className="text-yellow-500 shrink-0 fill-yellow-500"
									/>
								)}
								{worktree.merged && (
									<GitMerge size={14} className="text-purple-500 shrink-0" />
								)}
							</Button>
						</TooltipTrigger>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem onClick={onCloneWorktree}>
							<GitBranch size={14} className="mr-2" />
							Clone Worktree...
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onClick={handleMergeWorktree}
							disabled={isMergeDisabled}
						>
							<GitMerge size={14} className="mr-2" />
							{isMergeDisabled
								? `Merge Worktree (${mergeDisabledReason})`
								: "Merge Worktree..."}
						</ContextMenuItem>
						<ContextMenuItem onClick={() => setShowGitStatusDialog(true)}>
							<GitBranch size={14} className="mr-2" />
							Git Status
						</ContextMenuItem>
						<ContextMenuItem onClick={handleCopyPath}>
							<Clipboard size={14} className="mr-2" />
							Copy Path
						</ContextMenuItem>
						<ContextMenuItem onClick={handleOpenInCursor}>
							<ExternalLink size={14} className="mr-2" />
							Open in Cursor
						</ContextMenuItem>
						<ContextMenuItem onClick={handleOpenSettings}>
							<Settings size={14} className="mr-2" />
							Open Settings
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
				{worktree.description && (
					<TooltipContent side="right" className="max-w-xs">
						<p className="text-sm">{worktree.description}</p>
					</TooltipContent>
				)}
			</Tooltip>

			{/* Ports List - shown inline if port forwarding is configured */}
			{isExpanded && hasPortForwarding && (
				<WorktreePortsList worktree={worktree} workspaceId={workspaceId} />
			)}

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

					{/* New Terminal / Preview Buttons */}
					<div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
						<Button
							variant="ghost"
							size="sm"
							onClick={handleAddTab}
							className="flex-1 h-8 px-2 font-normal opacity-70 hover:opacity-100 min-w-0"
						>
							<Plus size={14} className="shrink-0" />
							<span className="truncate ml-1">Terminal</span>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleAddPreview}
							className="flex-1 h-8 px-2 font-normal opacity-70 hover:opacity-100 min-w-0"
						>
							<Monitor size={14} className="shrink-0" />
							<span className="truncate ml-1">Preview</span>
						</Button>
					</div>
				</div>
			)}

			{/* Remove Worktree Confirmation Dialog */}
			<Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove Worktree</DialogTitle>
						<DialogDescription>
							Are you sure you want to remove the worktree "{worktree.branch}"?
							This action cannot be undone.
						</DialogDescription>
					</DialogHeader>

					{/* Warning Message */}
					{removeWarning && (
						<div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-200 text-sm">
							{removeWarning}
						</div>
					)}

					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => {
								setShowRemoveDialog(false);
								setRemoveWarning("");
							}}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmRemoveWorktree}>
							Remove
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Merge Worktree Confirmation Dialog */}
			<Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Merge Worktree</DialogTitle>
						<DialogDescription>
							Merge "{worktree.branch}" into the selected target branch.
						</DialogDescription>
					</DialogHeader>

					{/* Target Branch Selector */}
					<div className="space-y-2 py-4">
						<label
							htmlFor="target-branch"
							className="text-sm font-medium text-gray-200"
						>
							Target Branch
						</label>
						<select
							id="target-branch"
							value={targetWorktreeId}
							onChange={(e) => handleTargetWorktreeChange(e.target.value)}
							className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{availableWorktrees.map((wt) => (
								<option key={wt.id} value={wt.id}>
									{wt.branch}
									{wt.id === activeWorktreeId ? " (active)" : ""}
								</option>
							))}
						</select>
					</div>

					{/* Warning Message */}
					{mergeWarning && (
						<div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-200 text-sm">
							{mergeWarning}
						</div>
					)}

					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => {
								setShowMergeDialog(false);
								setMergeWarning("");
							}}
						>
							Cancel
						</Button>
						<Button onClick={confirmMergeWorktree}>Merge</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Error Dialog */}
			<Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{errorTitle}</DialogTitle>
						<DialogDescription>
							<div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-200 text-sm">
								{errorMessage}
							</div>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setShowErrorDialog(false)}>Close</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Git Status Dialog */}
			<GitStatusDialog
				open={showGitStatusDialog}
				onOpenChange={setShowGitStatusDialog}
				workspaceId={workspaceId}
				worktreeId={worktree.id}
				worktreeBranch={worktree.branch}
			/>
		</div>
	);
}
