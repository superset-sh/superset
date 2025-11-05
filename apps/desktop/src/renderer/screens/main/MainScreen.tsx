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
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { useEffect, useState } from "react";
import type { MosaicNode, Tab, TabType, Workspace } from "shared/types";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import TabContent from "./components/MainContent/TabContent";
import TabGroup from "./components/MainContent/TabGroup";
import { PlaceholderState } from "./components/PlaceholderState";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

// Droppable wrapper for main content area
function DroppableMainContent({
	children,
	isOver,
}: {
	children: React.ReactNode;
	isOver: boolean;
}) {
	const { setNodeRef } = useDroppable({
		id: "main-content-drop-zone",
		data: {
			type: "main-content",
		},
	});

	return (
		<div
			ref={setNodeRef}
			className={`flex-1 overflow-hidden m-1 rounded-lg relative ${
				isOver ? "ring-2 ring-blue-500 ring-inset" : ""
			}`}
		>
			{children}
			{isOver && (
				<div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center">
					<div className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
						Drop to add to split view
					</div>
				</div>
			)}
		</div>
	);
}

export function MainScreen() {
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null); // Can be a group tab or any tab
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Drag and drop state
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isOverMainContent, setIsOverMainContent] = useState(false);

	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);

	// Helper: Create a new tab
	const createTab = async (
		workspaceId: string,
		worktreeId: string,
		name: string,
		type: TabType,
	) => {
		const result = await window.ipcRenderer.invoke("tab-create", {
			workspaceId,
			worktreeId,
			name,
			type,
		});

		if (!result.success || !result.tab) {
			console.error("[MainScreen] Failed to create tab:", result.error);
			return null;
		}

		return result.tab;
	};

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

	// Helper function to find a tab recursively (for finding sub-tabs inside groups)
	const findTabRecursive = (
		tabs: Tab[] | undefined,
		tabId: string,
	): { tab: Tab; parent?: Tab } | null => {
		if (!tabs) return null;

		for (const tab of tabs) {
			if (tab.id === tabId) {
				return { tab };
			}
			// Check if this tab is a group tab with children
			if (tab.type === "group" && tab.tabs) {
				for (const childTab of tab.tabs) {
					if (childTab.id === tabId) {
						return { tab: childTab, parent: tab };
					}
				}
			}
		}
		return null;
	};

	// Get selected tab and its parent (if it's a sub-tab)
	const tabResult = selectedWorktree?.tabs
		? findTabRecursive(selectedWorktree.tabs, selectedTabId ?? "")
		: null;

	const selectedTab = tabResult?.tab;
	const parentGroupTab = tabResult?.parent;

	const handleTabSelect = (worktreeId: string, tabId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabId(tabId);
		// Save active selection and update workspace state
		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabId,
			});
			// Update the current workspace state to reflect the new active selection
			setCurrentWorkspace({
				...currentWorkspace,
				activeWorktreeId: worktreeId,
				activeTabId: tabId,
			});
		}
	};

	const handleTabFocus = (tabId: string) => {
		// When a terminal gets focus, update the selected tab
		if (!currentWorkspace || !selectedWorktreeId) return;

		setSelectedTabId(tabId);
		// Save active selection and update workspace state
		window.ipcRenderer.invoke("workspace-set-active-selection", {
			workspaceId: currentWorkspace.id,
			worktreeId: selectedWorktreeId,
			tabId,
		});
		// Update the current workspace state to reflect the new active selection
		setCurrentWorkspace({
			...currentWorkspace,
			activeWorktreeId: selectedWorktreeId,
			activeTabId: tabId,
		});
	};

	const handleWorkspaceSelect = async (workspaceId: string) => {
		try {
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				setCurrentWorkspace(workspace);
				// Persist the active workspace
				await window.ipcRenderer.invoke(
					"workspace-set-active-workspace-id",
					workspaceId,
				);
				// Restore the active selection for this workspace
				const activeSelection = await window.ipcRenderer.invoke(
					"workspace-get-active-selection",
					workspaceId,
				);

				if (activeSelection?.worktreeId && activeSelection?.tabId) {
					setSelectedWorktreeId(activeSelection.worktreeId);
					setSelectedTabId(activeSelection.tabId);
				} else {
					// No saved selection, reset
					setSelectedWorktreeId(null);
					setSelectedTabId(null);
				}
			}
		} catch (error) {
			console.error("Failed to load workspace:", error);
		}
	};

	const handleWorktreeCreated = async () => {
		// Refresh workspace data after worktree creation
		if (!currentWorkspace) return;

		try {
			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);

			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
				// Also refresh workspaces list
				await loadAllWorkspaces();
			}
		} catch (error) {
			console.error("Failed to refresh workspace:", error);
		}
	};

	const handleUpdateWorktree = (worktreeId: string, updatedWorktree: any) => {
		// Optimistically update the worktree in the current workspace
		if (!currentWorkspace) return;

		const updatedWorktrees = currentWorkspace.worktrees.map((wt) =>
			wt.id === worktreeId ? updatedWorktree : wt,
		);

		const updatedCurrentWorkspace = {
			...currentWorkspace,
			worktrees: updatedWorktrees,
		};

		setCurrentWorkspace(updatedCurrentWorkspace);

		// Also update the workspaces array so the carousel renders the updated data
		if (workspaces) {
			setWorkspaces(
				workspaces.map((ws) =>
					ws.id === currentWorkspace.id ? updatedCurrentWorkspace : ws,
				),
			);
		}
	};

	const loadAllWorkspaces = async () => {
		try {
			const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");

			setWorkspaces(allWorkspaces);
		} catch (error) {
			console.error("Failed to load workspaces:", error);
		}
	};

	// Scan for existing worktrees when workspace is opened
	const scanWorktrees = async (workspaceId: string) => {
		try {
			const result = await window.ipcRenderer.invoke(
				"workspace-scan-worktrees",
				workspaceId,
			);

			if (result.success && result.imported && result.imported > 0) {
				console.log("[MainScreen] Imported worktrees:", result.imported);
				// Refresh workspace data
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					workspaceId,
				);

				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
			}
		} catch (error) {
			console.error("[MainScreen] Failed to scan worktrees:", error);
		}
	};

	// Load active workspace and all workspaces on mount
	useEffect(() => {
		const loadActiveWorkspace = async () => {
			try {
				setLoading(true);
				setError(null);

				// Load all workspaces
				await loadAllWorkspaces();

				// Try to load the active workspace first, fall back to last opened
				let workspaceId = await window.ipcRenderer.invoke(
					"workspace-get-active-workspace-id",
				);

				// Fall back to last opened if no active workspace
				if (!workspaceId) {
					const lastOpenedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get-last-opened",
					);
					workspaceId = lastOpenedWorkspace?.id ?? null;
				}

				if (workspaceId) {
					const workspace = await window.ipcRenderer.invoke(
						"workspace-get",
						workspaceId,
					);

					if (workspace) {
						setCurrentWorkspace(workspace);
						// Scan for existing worktrees
						await scanWorktrees(workspace.id);

						// Restore active selection for this workspace
						const activeSelection = await window.ipcRenderer.invoke(
							"workspace-get-active-selection",
							workspaceId,
						);

						if (activeSelection?.worktreeId && activeSelection?.tabId) {
							setSelectedWorktreeId(activeSelection.worktreeId);
							setSelectedTabId(activeSelection.tabId);
						}
					}
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setLoading(false);
			}
		};

		loadActiveWorkspace();
	}, []);

	// Listen for workspace-opened event from menu
	useEffect(() => {
		const handler = async (workspace: Workspace) => {
			console.log("[MainScreen] Workspace opened event received:", workspace);
			setCurrentWorkspace(workspace);
			setLoading(false);
			// Persist the active workspace
			await window.ipcRenderer.invoke(
				"workspace-set-active-workspace-id",
				workspace.id,
			);
			// Refresh workspaces list
			await loadAllWorkspaces();
			// Scan for existing worktrees
			await scanWorktrees(workspace.id);
		};

		console.log("[MainScreen] Setting up workspace-opened listener");
		window.ipcRenderer.on("workspace-opened", handler);
		return () => {
			console.log("[MainScreen] Removing workspace-opened listener");
			window.ipcRenderer.off("workspace-opened", handler);
		};
	}, []);

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

	// Helper: Add tab ID to mosaic tree
	const addTabToMosaicTree = (
		tree: MosaicNode<string> | null | undefined,
		tabId: string,
	): MosaicNode<string> => {
		if (!tree) {
			return tabId;
		}

		if (typeof tree === "string") {
			// Prevent duplicate IDs - if the tree already contains this tab ID, just return the tree
			if (tree === tabId) {
				console.warn(
					`[MainScreen] Attempted to add duplicate tab ID "${tabId}" to mosaic tree`,
				);
				return tree;
			}

			// Single tab - create a split
			return {
				direction: "row",
				first: tree,
				second: tabId,
				splitPercentage: 50,
			};
		}

		// Check if the tab ID already exists in the tree (recursively)
		const containsTabId = (node: MosaicNode<string>): boolean => {
			if (typeof node === "string") {
				return node === tabId;
			}
			return containsTabId(node.first) || containsTabId(node.second);
		};

		if (containsTabId(tree)) {
			console.warn(
				`[MainScreen] Tab ID "${tabId}" already exists in mosaic tree, skipping addition`,
			);
			return tree;
		}

		// Tree node - add to the second branch
		return {
			...tree,
			second: addTabToMosaicTree(tree.second, tabId),
		};
	};

	// Drag and drop handlers
	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
		setIsOverMainContent(false);
	};

	const handleDragOver = (event: DragOverEvent) => {
		const overId = event.over?.id;
		setIsOverMainContent(overId === "main-content-drop-zone");
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);
		setIsOverMainContent(false);

		if (!over || active.id === over.id) return;

		const activeData = active.data.current;
		const overData = over.data.current;

		// Only handle tab dragging
		if (activeData?.type !== "tab") {
			return;
		}

		// Handle dropping onto the main content area
		if (over.id === "main-content-drop-zone") {
			const activeData = active.data.current;
			const draggedTabId = active.id as string;

			// Only handle tab dragging
			if (activeData?.type !== "tab") {
				return;
			}

			const draggedWorktreeId = activeData.worktreeId as string;

			// Check if the dragged tab is from the same worktree as the currently selected tab
			if (draggedWorktreeId !== selectedWorktreeId) {
				console.log(
					"[MainScreen] Cannot drop tab from different worktree onto main content",
				);
				return;
			}

			if (!currentWorkspace || !selectedWorktreeId) return;

			const worktree = currentWorkspace.worktrees.find(
				(wt) => wt.id === selectedWorktreeId,
			);
			if (!worktree) return;

			const draggedTab = findTabById(worktree.tabs, draggedTabId);
			if (!draggedTab || draggedTab.type === "group") {
				console.log("[MainScreen] Cannot drop group tabs onto main content");
				return;
			}

			// Case 1: Currently viewing a group tab - add the dragged tab to that group
			if (selectedTab?.type === "group") {
				try {
					const parentTabId = activeData.parentTabId;

					// Check if the dragged tab is already in this group
					const isAlreadyInGroup = selectedTab.tabs?.some(
						(t) => t.id === draggedTabId,
					);
					if (isAlreadyInGroup) {
						console.log(
							"[MainScreen] Tab is already in this group - creating duplicate tab for split",
						);

						// Find the original tab to get its properties
						const originalTab = findTabById(worktree.tabs, draggedTabId);
						if (!originalTab) {
							console.error(
								"[MainScreen] Could not find original tab:",
								draggedTabId,
							);
							return;
						}

						// Create a new duplicate tab
						const newTab = await createTab(
							currentWorkspace.id,
							selectedWorktreeId,
							originalTab.name,
							originalTab.type,
						);

						if (!newTab) return;

						// Move the new tab into the group
						const moveResult = await window.ipcRenderer.invoke("tab-move", {
							workspaceId: currentWorkspace.id,
							worktreeId: selectedWorktreeId,
							tabId: newTab.id,
							sourceParentTabId: undefined,
							targetParentTabId: selectedTab.id,
							targetIndex: selectedTab.tabs?.length || 0,
						});

						if (!moveResult.success) {
							console.error("[MainScreen] Failed to move tab:", moveResult.error);
							return;
						}

						// Update the mosaic tree to include the new tab
						const updatedMosaicTree = addTabToMosaicTree(
							selectedTab.mosaicTree,
							newTab.id,
						);

						await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
							workspaceId: currentWorkspace.id,
							worktreeId: selectedWorktreeId,
							tabId: selectedTab.id,
							mosaicTree: updatedMosaicTree,
						});

						// Refresh workspace to show the updated structure
						const refreshedWorkspace = await window.ipcRenderer.invoke(
							"workspace-get",
							currentWorkspace.id,
						);
						if (refreshedWorkspace) {
							setCurrentWorkspace(refreshedWorkspace);
						}
						return;
					}

					// Move the tab into the group
					const moveResult = await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: draggedTabId,
						sourceParentTabId: parentTabId,
						targetParentTabId: selectedTab.id,
						targetIndex: selectedTab.tabs?.length || 0,
					});

					if (!moveResult.success) {
						console.error("[MainScreen] Failed to move tab:", moveResult.error);
						return;
					}

					// Update the mosaic tree to include the new tab
					const updatedMosaicTree = addTabToMosaicTree(
						selectedTab.mosaicTree,
						draggedTabId,
					);

					await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: selectedTab.id,
						mosaicTree: updatedMosaicTree,
					});

					// Refresh workspace to show the updated structure
					const refreshedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get",
						currentWorkspace.id,
					);
					if (refreshedWorkspace) {
						setCurrentWorkspace(refreshedWorkspace);
					}
				} catch (error) {
					console.error("[MainScreen] Error adding tab to group:", error);
				}
			}
			// Case 2: Currently viewing a single tab - create a new group with both tabs
			else if (selectedTab) {
				try {
					// If dragging a tab onto itself, create a new duplicate tab for the split
					let secondTabId = draggedTabId;
					const parentTabId = activeData.parentTabId;

					if (draggedTabId === selectedTab.id) {
						console.log(
							"[MainScreen] Dragging tab onto itself - creating duplicate tab for split",
						);

						// Create a new tab with the same type and name
						const newTab = await createTab(
							currentWorkspace.id,
							selectedWorktreeId,
							selectedTab.name,
							selectedTab.type,
						);

						if (!newTab) return;

						secondTabId = newTab.id;
					}

					// Create a new group tab
					const groupTab = await createTab(
						currentWorkspace.id,
						selectedWorktreeId,
						"Tab Group",
						"group",
					);

					if (!groupTab) return;

					const groupTabId = groupTab.id;

					// Move both tabs into the group
					// First, move the currently selected tab
					await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: selectedTab.id,
						sourceParentTabId: undefined,
						targetParentTabId: groupTabId,
						targetIndex: 0,
					});

					// Then, move the second tab (either the dragged tab or the newly created one)
					await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: secondTabId,
						sourceParentTabId:
							secondTabId === draggedTabId ? parentTabId : undefined,
						targetParentTabId: groupTabId,
						targetIndex: 1,
					});

					// Create a simple mosaic tree with both tabs
					const mosaicTree: MosaicNode<string> = {
						direction: "row",
						first: selectedTab.id,
						second: secondTabId,
						splitPercentage: 50,
					};

					await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: groupTabId,
						mosaicTree,
					});

					// Select the new group tab to show the mosaic
					setSelectedTabId(groupTabId);
					await window.ipcRenderer.invoke("workspace-set-active-selection", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: groupTabId,
					});

					// Refresh workspace to show the updated structure
					const refreshedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get",
						currentWorkspace.id,
					);
					if (refreshedWorkspace) {
						setCurrentWorkspace(refreshedWorkspace);
					}
				} catch (error) {
					console.error("[MainScreen] Error creating tab group:", error);
				}
			}
			return;
		}

		// Handle sidebar drag operations (reordering, moving between groups)
		const draggedWorktreeId = activeData.worktreeId as string;
		const draggedTabId = active.id as string;
		const activeParentTabId = activeData.parentTabId;
		const overParentTabId = overData?.parentTabId;

		if (!currentWorkspace || !draggedWorktreeId) return;

		const worktree = currentWorkspace.worktrees.find(
			(wt) => wt.id === draggedWorktreeId,
		);
		if (!worktree) return;

		try {
			// Dropping onto a group tab or group area
			if (overData?.type === "group" || overData?.type === "group-area") {
				const groupTabId = overData.groupTabId as string;

				// Don't allow dropping a tab onto its own parent
				if (activeParentTabId === groupTabId) {
					return;
				}

				const draggedTab = findTabById(worktree.tabs, draggedTabId);
				const groupTab = findTabById(worktree.tabs, groupTabId);

				if (!draggedTab || !groupTab || groupTab.type !== "group") {
					console.error("[MainScreen] Invalid tab or group tab");
					return;
				}

				// Move the tab into the group
				const moveResult = await window.ipcRenderer.invoke("tab-move", {
					workspaceId: currentWorkspace.id,
					worktreeId: draggedWorktreeId,
					tabId: draggedTabId,
					sourceParentTabId: activeParentTabId,
					targetParentTabId: groupTabId,
					targetIndex: groupTab.tabs?.length || 0,
				});

				if (!moveResult.success) {
					console.error("[MainScreen] Failed to move tab:", moveResult.error);
					return;
				}

				// Update the mosaic tree to include the new tab
				const updatedMosaicTree = addTabToMosaicTree(
					groupTab.mosaicTree,
					draggedTabId,
				);

				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId: currentWorkspace.id,
					worktreeId: draggedWorktreeId,
					tabId: groupTabId,
					mosaicTree: updatedMosaicTree,
				});

				// Refresh workspace
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				);
				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
				return;
			}

			// Reordering within the same parent group
			if (overData?.type === "tab" && activeParentTabId === overParentTabId) {
				const parentTab = activeParentTabId
					? findTabById(worktree.tabs, activeParentTabId)
					: null;

				const tabsArray = parentTab?.tabs || worktree.tabs;
				const oldIndex = tabsArray.findIndex((t) => t.id === active.id);
				const newIndex = tabsArray.findIndex((t) => t.id === over.id);

				if (oldIndex === -1 || newIndex === -1) return;

				// Save to backend
				const reorderedTabs = arrayMove(tabsArray, oldIndex, newIndex);
				const newOrder = reorderedTabs.map((t) => t.id);
				const result = await window.ipcRenderer.invoke("tab-reorder", {
					workspaceId: currentWorkspace.id,
					worktreeId: draggedWorktreeId,
					parentTabId: activeParentTabId,
					tabIds: newOrder,
				});

				if (!result.success) {
					console.error("[MainScreen] Failed to reorder tabs:", result.error);
				}

				// Refresh workspace
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				);
				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
			}
			// Moving to a different parent group
			else if (
				overData?.type === "tab" &&
				activeParentTabId !== overParentTabId
			) {
				const targetParentTabId = overParentTabId;

				if (targetParentTabId) {
					const draggedTab = findTabById(worktree.tabs, draggedTabId);
					const targetGroupTab = findTabById(worktree.tabs, targetParentTabId);

					if (
						!draggedTab ||
						!targetGroupTab ||
						targetGroupTab.type !== "group"
					) {
						console.error("[MainScreen] Invalid tab or target group");
						return;
					}

					// Move the tab into the group
					const moveResult = await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: draggedWorktreeId,
						tabId: draggedTabId,
						sourceParentTabId: activeParentTabId,
						targetParentTabId: targetParentTabId,
						targetIndex: targetGroupTab.tabs?.length || 0,
					});

					if (!moveResult.success) {
						console.error("[MainScreen] Failed to move tab:", moveResult.error);
						return;
					}

					// Update the mosaic tree to include the new tab
					const updatedMosaicTree = addTabToMosaicTree(
						targetGroupTab.mosaicTree,
						draggedTabId,
					);

					await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
						workspaceId: currentWorkspace.id,
						worktreeId: draggedWorktreeId,
						tabId: targetParentTabId,
						mosaicTree: updatedMosaicTree,
					});

					// Refresh workspace
					const refreshedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get",
						currentWorkspace.id,
					);
					if (refreshedWorkspace) {
						setCurrentWorkspace(refreshedWorkspace);
					}
				}
			}
		} catch (error) {
			console.error("[MainScreen] Error during sidebar drag operation:", error);
		}
	};

	// Get active item for drag overlay
	const activeTab =
		activeId && selectedWorktree
			? findTabById(selectedWorktree.tabs, activeId)
			: null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<div className="flex h-screen relative text-neutral-300">
				<Background />

				{/* App Frame - continuous border + sidebar + topbar */}
				<AppFrame>
					<ResizablePanelGroup direction="horizontal" autoSaveId="main-layout">
						<ResizablePanel
							defaultSize={20}
							minSize={15}
							maxSize={40}
							collapsible={true}
						>
							{isSidebarOpen && workspaces && (
								<Sidebar
									workspaces={workspaces}
									currentWorkspace={currentWorkspace}
									onTabSelect={handleTabSelect}
									onWorktreeCreated={handleWorktreeCreated}
									onWorkspaceSelect={handleWorkspaceSelect}
									onUpdateWorktree={handleUpdateWorktree}
									selectedTabId={selectedTabId ?? undefined}
									onCollapse={() => setIsSidebarOpen(false)}
									isDragging={!!activeId}
								/>
							)}
						</ResizablePanel>
						<ResizableHandle withHandle />
						{/* Main Content Area */}
						<ResizablePanel minSize={30}>
							<div className="flex flex-col h-full overflow-hidden">
								{/* Top Bar */}
								{/* <TopBar
							isSidebarOpen={isSidebarOpen}
							onOpenSidebar={() => setIsSidebarOpen(true)}
							workspaceName={currentWorkspace?.name}
							currentBranch={currentWorkspace?.branch}
						/> */}

								{/* Content Area */}
								<DroppableMainContent isOver={isOverMainContent}>
									{loading ||
									error ||
									!currentWorkspace ||
									!selectedTab ||
									!selectedWorktree ? (
										<PlaceholderState
											loading={loading}
											error={error}
											hasWorkspace={!!currentWorkspace}
										/>
									) : parentGroupTab ? (
										// Selected tab is a sub-tab of a group → display the parent group's mosaic
										<TabGroup
											groupTab={parentGroupTab}
											workingDirectory={
												selectedWorktree.path || currentWorkspace.repoPath
											}
											workspaceId={currentWorkspace.id}
											worktreeId={selectedWorktreeId ?? undefined}
											selectedTabId={selectedTabId ?? undefined}
											onTabFocus={handleTabFocus}
										/>
									) : selectedTab.type === "group" ? (
										// Selected tab is a group tab → display its mosaic layout
										<TabGroup
											groupTab={selectedTab}
											workingDirectory={
												selectedWorktree.path || currentWorkspace.repoPath
											}
											workspaceId={currentWorkspace.id}
											worktreeId={selectedWorktreeId ?? undefined}
											selectedTabId={selectedTabId ?? undefined}
											onTabFocus={handleTabFocus}
										/>
									) : (
										// Base level tab (not inside a group) → display full width/height
										<div className="w-full h-full">
											<TabContent
												tab={selectedTab}
												workingDirectory={
													selectedWorktree.path || currentWorkspace.repoPath
												}
												workspaceId={currentWorkspace.id}
												worktreeId={selectedWorktreeId ?? undefined}
												worktree={selectedWorktree}
												groupTabId="" // No parent group
												selectedTabId={selectedTabId ?? undefined}
												onTabFocus={handleTabFocus}
											/>
										</div>
									)}
								</DroppableMainContent>
							</div>
						</ResizablePanel>
					</ResizablePanelGroup>
				</AppFrame>
			</div>

			{/* Drag Overlay - follows the cursor */}
			<DragOverlay>
				{activeTab ? (
					<div className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm opacity-90 cursor-grabbing">
						{activeTab.name}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
