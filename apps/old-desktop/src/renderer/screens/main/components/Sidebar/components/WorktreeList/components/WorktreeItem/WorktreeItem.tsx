import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { ChevronRight, Edit2, FolderOpen } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { NodeApi, TreeApi } from "react-arborist";
import { Tree } from "react-arborist";
import type { MosaicNode } from "react-mosaic-component";
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

interface ProxyStatus {
	canonical: number;
	target?: number;
	service?: string;
	active: boolean;
}

// Tree node type for react-arborist
type TreeNode = {
	id: string;
	name: string;
	tab: Tab;
	children?: TreeNode[];
};

// Constants
const TREE_ROW_HEIGHT = 28;
const TREE_MIN_HEIGHT = 10;
const TREE_MAX_HEIGHT = 600;

// Convert Tab[] to react-arborist format
function convertTabsToTreeData(tabs: Tab[]): TreeNode[] {
	return tabs.map((tab) => {
		const node: TreeNode = {
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

// Helper: Collect all group tab IDs recursively
function collectGroupTabIds(tabs: Tab[]): Set<string> {
	const groupTabIds = new Set<string>();
	const collect = (tabList: Tab[]) => {
		for (const tab of tabList) {
			if (tab.type === "group") {
				groupTabIds.add(tab.id);
				if (tab.tabs) {
					collect(tab.tabs);
				}
			}
		}
	};
	collect(tabs);
	return groupTabIds;
}

// Helper: Build merge warning message
function buildMergeWarning(
	canMergeResult: {
		targetHasUncommittedChanges?: boolean;
		sourceHasUncommittedChanges?: boolean;
	},
	sourceBranch: string,
	targetBranch?: string,
): string {
	const warnings: string[] = [];

	if (canMergeResult.targetHasUncommittedChanges) {
		const targetBranchText = targetBranch ? ` (${targetBranch})` : "";
		warnings.push(
			`The target worktree${targetBranchText} has uncommitted changes.`,
		);
	}

	if (canMergeResult.sourceHasUncommittedChanges) {
		warnings.push(
			`The source worktree (${sourceBranch}) has uncommitted changes.`,
		);
	}

	return warnings.length > 0
		? `Warning: ${warnings.join(" ")} The merge will proceed anyway.`
		: "";
}

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
	// Track expanded group tabs - initialize with all group tabs expanded by default
	const tabs = Array.isArray(worktree.tabs) ? worktree.tabs : [];
	const [expandedGroupTabs, setExpandedGroupTabs] = useState<Set<string>>(() =>
		collectGroupTabIds(tabs),
	);

	// Track multi-selected tabs
	const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
	const [lastClickedTabId, setLastClickedTabId] = useState<string | null>(null);

	// Track if merge is disabled (when this is the active worktree)
	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
	const [isMergeDisabled, setIsMergeDisabled] = useState(false);
	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
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

	// Generate ID for select element (must be called before conditional return)
	const targetBranchSelectId = useId();

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
	}, [workspaceId, worktree.id]);

	// Calculate responsive height based on visible items
	// Must be before early return to satisfy React hooks rules
	const treeData = useMemo(() => convertTabsToTreeData(tabs), [tabs]);
	const treeHeight = useMemo(() => {
		// Count visible nodes (including expanded children)
		const countVisibleNodes = (nodes: TreeNode[]): number => {
			let count = 0;
			for (const node of nodes) {
				count += 1; // Count the node itself
				if (
					node.tab.type === "group" &&
					node.children &&
					expandedGroupTabs.has(node.id)
				) {
					count += countVisibleNodes(node.children);
				}
			}
			return count;
		};

		const visibleCount = countVisibleNodes(treeData);
		const calculatedHeight = visibleCount * TREE_ROW_HEIGHT;
		return Math.max(
			TREE_MIN_HEIGHT,
			Math.min(TREE_MAX_HEIGHT, calculatedHeight),
		);
	}, [treeData, expandedGroupTabs]);

	// Only render tabs for the active worktree
	if (!isActive) {
		return null;
	}

	// Context menu handlers (unused but kept for potential future use)
	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
	const handleCopyPath = async () => {
		const path = await window.ipcRenderer.invoke("worktree-get-path", {
			workspaceId,
			worktreeId: worktree.id,
		});
		if (path) {
			navigator.clipboard.writeText(path);
		}
	};

	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
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

	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
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

		setMergeWarning(
			buildMergeWarning(canMergeResult, worktree.branch, targetBranch),
		);
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

		setMergeWarning(
			buildMergeWarning(
				canMergeResult,
				worktree.branch,
				targetWorktree?.branch,
			),
		);
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

	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
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

	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
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

	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
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

	// biome-ignore lint/correctness/noUnusedVariables: kept for potential future use
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

	// Handle drag and drop (move) using react-arborist
	const handleMove = async (args: {
		dragIds: string[];
		dragNodes: NodeApi<TreeNode>[];
		parentId: string | null;
		parentNode: NodeApi<TreeNode> | null;
		index: number;
	}) => {
		if (args.dragNodes.length === 0) return;

		const draggedNode = args.dragNodes[0];
		const draggedTab = draggedNode.data.tab as Tab;

		if (!draggedTab) return;

		const draggedTabId = draggedTab.id;
		const isGroupTab = draggedTab.type === "group";
		const sourceParent = draggedNode.parent;
		const sourceParentTabId =
			sourceParent?.data.tab?.type === "group" ? sourceParent.id : null;
		const targetParentTabId =
			args.parentNode?.data.tab?.type === "group" ? args.parentNode.id : null;

		// If moving to a different parent, use tab-move
		if (sourceParentTabId !== targetParentTabId) {
			// Prevent group tabs from being moved into other groups
			if (isGroupTab && targetParentTabId) {
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
			return;
		}

		// Same parent - handle reordering (works for both regular tabs and group tabs)
		const parentTabs = sourceParentTabId
			? (sourceParent?.data.tab as Tab).tabs || []
			: tabs;

		if (!parentTabs || parentTabs.length === 0) return;

		// Get current order
		const currentOrder = parentTabs.map((t) => t.id);
		const draggedIndex = currentOrder.indexOf(draggedTabId);
		const targetIndex = args.index;

		if (
			draggedIndex !== -1 &&
			targetIndex !== -1 &&
			draggedIndex !== targetIndex
		) {
			// Reorder
			const newOrder = [...currentOrder];
			newOrder.splice(draggedIndex, 1);
			newOrder.splice(targetIndex, 0, draggedTabId);

			try {
				const result = await window.ipcRenderer.invoke("tab-reorder", {
					workspaceId,
					worktreeId: worktree.id,
					parentTabId: sourceParentTabId || undefined,
					tabIds: newOrder,
				});

				if (result.success) {
					onReload();
				} else {
					console.error("Failed to reorder tabs:", result.error);
				}
			} catch (error) {
				console.error("Error reordering tabs:", error);
			}
		}
	};

	// Render node content for react-arborist Tree
	const renderNode = (props: {
		node: NodeApi<TreeNode>;
		style: React.CSSProperties;
		tree: TreeApi<TreeNode>;
		dragHandle?: (el: HTMLDivElement | null) => void;
		preview?: boolean;
	}) => {
		const { node, style, dragHandle } = props;
		const tab = node.data.tab as Tab;
		const isGroup = tab.type === "group";
		const isSelected = selectedTabId === tab.id;
		const isExpanded = node.isOpen;

		if (isGroup) {
			return (
				<div style={style} className="flex items-center" ref={dragHandle}>
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

		// Regular tab - attach drag handle for dragging
		return (
			<div style={style} ref={dragHandle}>
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
			{/* Ports List - shown inline if port forwarding is configured */}
			{hasPortForwarding && (
				<WorktreePortsList worktree={worktree} workspaceId={workspaceId} />
			)}

			{/* Tabs List */}
			<div className="space-y-0.5">
				<Tree
					data={treeData}
					width="100%"
					height={treeHeight}
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
					openByDefault={true}
					initialOpenState={Object.fromEntries(
						treeData
							.filter((item) => item.tab.type === "group")
							.map((item) => [item.id, true]),
					)}
					rowHeight={TREE_ROW_HEIGHT}
					indent={12}
					disableDrop={(args) => {
						// Prevent dropping group tabs into other groups
						const draggedTab = args.dragNodes[0]?.data.tab as Tab;
						const targetParentTab = args.parentNode?.data.tab as Tab;
						return (
							draggedTab?.type === "group" && targetParentTab?.type === "group"
						);
					}}
				>
					{renderNode}
				</Tree>
			</div>

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
							id={targetBranchSelectId}
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
