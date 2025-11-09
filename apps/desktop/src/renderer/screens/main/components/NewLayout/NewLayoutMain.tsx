import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { Toaster } from "@superset/ui/sonner";
import type { RouterOutputs } from "@superset/api";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { toast } from "sonner";
import type { Tab, Workspace, Worktree } from "shared/types";
import { mockTasks } from "../../../../../lib/mock-data";

// Use the tRPC API type for tasks
type Task = RouterOutputs["task"]["all"][number];
import { AppFrame } from "../AppFrame";
import { Background } from "../Background";
import TabContent from "../MainContent/TabContent";
import TabGroup from "../MainContent/TabGroup";
import { PlaceholderState } from "../PlaceholderState";
import { DiffTab } from "../TabContent/components/DiffTab";
import { DeleteWorktreeModal } from "../../../../components/DeleteWorktreeModal";
import { AddTaskModal } from "./AddTaskModal";
import { TaskTabs } from "./TaskTabs";
import { WorktreeTabView } from "./WorktreeTabView";
import { WorktreeTabsSidebar } from "./WorktreeTabsSidebar";

export const NewLayoutMain: React.FC = () => {
	const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);
	const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
	const [activeTaskId, setActiveTaskId] = useState(mockTasks[0].id);
	const [allTasks, setAllTasks] = useState<Task[]>(mockTasks);

	// Workspace state
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Delete worktree modal state
	const [deleteWorktreeId, setDeleteWorktreeId] = useState<string | null>(null);
	const [deleteWorktreeInfo, setDeleteWorktreeInfo] = useState<{
		name: string;
		path: string;
		hasUncommittedChanges: boolean;
	} | null>(null);

	// Derive openTasks from worktrees - tasks are "opened" if they have a worktree with matching description
	const openTasks = useMemo(() => {
		if (!currentWorkspace?.worktrees || !allTasks) return [];

		// Create a set of worktree descriptions and branches for matching
		const worktreeDescriptions = new Set(
			currentWorkspace.worktrees.map(wt => wt.description?.toLowerCase())
		);
		const worktreeBranches = new Set(
			currentWorkspace.worktrees.map(wt => wt.branch)
		);

		return allTasks.filter(task => {
			// Match by description (task title) or by branch if task has one
			const matchByDescription = task.title && worktreeDescriptions.has(task.title.toLowerCase());
			const matchByBranch = task.branch && worktreeBranches.has(task.branch);
			return matchByDescription || matchByBranch;
		});
	}, [currentWorkspace?.worktrees, allTasks]);

	const handleCollapseSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && !panel.isCollapsed()) {
			panel.collapse();
			setIsSidebarOpen(false);
		}
	};

	const handleExpandSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && panel.isCollapsed()) {
			panel.expand();
			setIsSidebarOpen(true);
		}
	};

	// Get selected worktree
	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
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

	// Load all workspaces
	const loadAllWorkspaces = async () => {
		try {
			const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");
			setWorkspaces(allWorkspaces);
		} catch (error) {
			console.error("Failed to load workspaces:", error);
		}
	};

	// Handle tab selection
	const handleTabSelect = (worktreeId: string, tabId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabId(tabId);

		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabId,
			});

			setCurrentWorkspace({
				...currentWorkspace,
				activeWorktreeId: worktreeId,
				activeTabId: tabId,
			});
		}
	};

	// Handle tab focus (for terminals)
	const handleTabFocus = (tabId: string) => {
		if (!currentWorkspace || !selectedWorktreeId) return;

		setSelectedTabId(tabId);

		window.ipcRenderer.invoke("workspace-set-active-selection", {
			workspaceId: currentWorkspace.id,
			worktreeId: selectedWorktreeId,
			tabId,
		});

		setCurrentWorkspace({
			...currentWorkspace,
			activeWorktreeId: selectedWorktreeId,
			activeTabId: tabId,
		});
	};

	// Handle workspace selection
	const handleWorkspaceSelect = async (workspaceId: string) => {
		try {
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				setCurrentWorkspace(workspace);
				await window.ipcRenderer.invoke(
					"workspace-set-active-workspace-id",
					workspaceId,
				);

				const activeSelection = await window.ipcRenderer.invoke(
					"workspace-get-active-selection",
					workspaceId,
				);

				if (activeSelection?.worktreeId && activeSelection?.tabId) {
					setSelectedWorktreeId(activeSelection.worktreeId);
					setSelectedTabId(activeSelection.tabId);
				} else {
					setSelectedWorktreeId(null);
					setSelectedTabId(null);
				}
			}
		} catch (error) {
			console.error("Failed to load workspace:", error);
		}
	};

	// Handle worktree created
	const handleWorktreeCreated = async () => {
		if (!currentWorkspace) return;

		try {
			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);

			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
				await loadAllWorkspaces();
			}
		} catch (error) {
			console.error("Failed to refresh workspace:", error);
		}
	};

	// Handle worktree update
	const handleUpdateWorktree = (
		worktreeId: string,
		updatedWorktree: Worktree,
	) => {
		if (!currentWorkspace) return;

		const updatedWorktrees = currentWorkspace.worktrees.map((wt) =>
			wt.id === worktreeId ? updatedWorktree : wt,
		);

		const updatedCurrentWorkspace = {
			...currentWorkspace,
			worktrees: updatedWorktrees,
		};

		setCurrentWorkspace(updatedCurrentWorkspace);

		if (workspaces) {
			setWorkspaces(
				workspaces.map((ws) =>
					ws.id === currentWorkspace.id ? updatedCurrentWorkspace : ws,
				),
			);
		}
	};

	// Handle show diff - creates a diff tab
	const handleShowDiff = async (worktreeId: string) => {
		if (!currentWorkspace) return;

		// Find the worktree
		const worktree = currentWorkspace.worktrees?.find(
			(wt) => wt.id === worktreeId,
		);
		if (!worktree) return;

		// Check if a diff tab already exists for this worktree
		const existingDiffTab = worktree.tabs?.find((tab) => tab.type === "diff");

		if (existingDiffTab) {
			// If a diff tab already exists, just select it
			await window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId: worktreeId,
				tabId: existingDiffTab.id,
			});

			// Reload the workspace to get the updated state
			const updatedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);
			if (updatedWorkspace) {
				setCurrentWorkspace(updatedWorkspace);
			}

			// Update the workspaces array
			await loadAllWorkspaces();

			// Set state to select the tab
			setSelectedWorktreeId(worktreeId);
			setSelectedTabId(existingDiffTab.id);
			return;
		}

		// Create a new diff tab
		const result = await window.ipcRenderer.invoke("tab-create", {
			workspaceId: currentWorkspace.id,
			worktreeId: worktreeId,
			name: `Changes – ${worktree.branch}`,
			type: "diff",
		});

		if (result.success && result.tab) {
			// Set active selection in backend first
			await window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId: worktreeId,
				tabId: result.tab.id,
			});

			// Reload the workspace to get the updated state with the new tab
			const updatedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);
			if (updatedWorkspace) {
				setCurrentWorkspace(updatedWorkspace);
			}

			// Update the workspaces array
			await loadAllWorkspaces();

			// Set state to select the new tab
			setSelectedWorktreeId(worktreeId);
			setSelectedTabId(result.tab.id);
		}
	};

	// Task handlers
	const handleOpenAddTaskModal = () => {
		setIsAddTaskModalOpen(true);
	};

	const handleCloseAddTaskModal = () => {
		setIsAddTaskModalOpen(false);
	};

	const handleSelectTask = async (task: Task) => {
		// Check if task already has a worktree (match by description or branch)
		const existingWorktree = currentWorkspace?.worktrees?.find(
			wt => {
				const matchByDescription = wt.description?.toLowerCase() === task.title.toLowerCase();
				const matchByBranch = task.branch && wt.branch === task.branch;
				return matchByDescription || matchByBranch;
			}
		);

		if (existingWorktree) {
			// Task already has a worktree - just switch to it
			setActiveTaskId(task.id);
			setSelectedWorktreeId(existingWorktree.id);
			// Select first tab if any
			if (existingWorktree.tabs && existingWorktree.tabs.length > 0) {
				setSelectedTabId(existingWorktree.tabs[0].id);
			}
			// Close the modal
			handleCloseAddTaskModal();
		} else {
			// Task doesn't have a worktree - create one
			if (!currentWorkspace) return;

			const createWorktreePromise = (async () => {
				// Use task.branch if set, otherwise use slug
				const branchName = task.branch || task.slug.toLowerCase();

				// Check if branch already exists in git
				const branchesResult = await window.ipcRenderer.invoke("workspace-list-branches", currentWorkspace.id);
				const branchExists = branchesResult.branches?.includes(branchName);

				const result = await window.ipcRenderer.invoke("worktree-create", {
					workspaceId: currentWorkspace.id,
					title: task.title,
					description: task.description || undefined,
					branch: branchName,
					createBranch: !branchExists, // Only create new branch if it doesn't exist
				});

				if (result.success && result.worktree) {
					// Reload workspace to get updated worktrees
					await handleWorktreeCreated();

					// Switch to new worktree
					setSelectedWorktreeId(result.worktree.id);
					setActiveTaskId(task.id);

					// Select first tab if any
					if (result.worktree.tabs && result.worktree.tabs.length > 0) {
						setSelectedTabId(result.worktree.tabs[0].id);
					}

					// Close the modal
					handleCloseAddTaskModal();

					return result.worktree;
				} else {
					throw new Error(result.error || "Failed to create worktree");
				}
			})();

			toast.promise(createWorktreePromise, {
				loading: `Creating worktree for ${task.slug}...`,
				success: `Worktree created for ${task.slug}`,
				error: (err) => `Failed to create worktree: ${err.message}`,
			});
		}
	};

	const handleCreateTask = async (taskData: Pick<Task, 'title' | 'description' | 'status'> & {
		assignee: string;
		branch: string;
	}) => {
		if (!currentWorkspace) return;

		try {
			// Create worktree using IPC
			const result = await window.ipcRenderer.invoke("worktree-create", {
				workspaceId: currentWorkspace.id,
				title: taskData.title,
				description: taskData.description || undefined,
				branch: taskData.branch,
				createBranch: true,
			});

			if (result.success && result.worktree) {
				// Reload workspace to get updated worktrees
				await handleWorktreeCreated();

				// Switch to new worktree
				setSelectedWorktreeId(result.worktree.id);

				// Select first tab if any
				if (result.worktree.tabs && result.worktree.tabs.length > 0) {
					setSelectedTabId(result.worktree.tabs[0].id);
				}

				console.log("Worktree created successfully:", result.worktree);
			} else {
				console.error("Failed to create worktree:", result.error);
			}
		} catch (error) {
			console.error("Error creating worktree:", error);
		}
	};

	// Handle worktree deletion
	const handleDeleteWorktree = async (worktreeId: string) => {
		if (!currentWorkspace) return;

		try {
			// Check if worktree can be removed and get uncommitted changes info
			const result = await window.ipcRenderer.invoke("worktree-can-remove", {
				workspaceId: currentWorkspace.id,
				worktreeId,
			});

			if (result.success) {
				const worktree = currentWorkspace.worktrees.find(wt => wt.id === worktreeId);
				if (!worktree) return;

				// Set delete info and show modal
				setDeleteWorktreeId(worktreeId);
				setDeleteWorktreeInfo({
					name: worktree.description || worktree.branch,
					path: worktree.path,
					hasUncommittedChanges: result.hasUncommittedChanges || false,
				});
			} else {
				console.error("Failed to check worktree status:", result.error);
			}
		} catch (error) {
			console.error("Error checking worktree status:", error);
		}
	};

	const handleConfirmDelete = async () => {
		if (!currentWorkspace || !deleteWorktreeId) return;

		try {
			const result = await window.ipcRenderer.invoke("worktree-remove", {
				workspaceId: currentWorkspace.id,
				worktreeId: deleteWorktreeId,
			});

			if (result.success) {
				// If deleted worktree was active, switch to another worktree
				if (selectedWorktreeId === deleteWorktreeId) {
					const remainingWorktrees = currentWorkspace.worktrees.filter(
						wt => wt.id !== deleteWorktreeId
					);
					if (remainingWorktrees.length > 0) {
						setSelectedWorktreeId(remainingWorktrees[0].id);
						// Select first tab in the new worktree
						if (remainingWorktrees[0].tabs && remainingWorktrees[0].tabs.length > 0) {
							setSelectedTabId(remainingWorktrees[0].tabs[0].id);
						}
					} else {
						setSelectedWorktreeId(null);
						setSelectedTabId(null);
					}
				}

				// Reload workspace to update UI
				await handleWorktreeCreated();

				// Reset delete modal state
				setDeleteWorktreeId(null);
				setDeleteWorktreeInfo(null);
			} else {
				throw new Error(result.error || "Failed to delete worktree");
			}
		} catch (error) {
			console.error("Error deleting worktree:", error);
			throw error; // Let modal handle error display
		}
	};

	// Load active workspace on mount
	useEffect(() => {
		const loadActiveWorkspace = async () => {
			try {
				setLoading(true);
				setError(null);

				await loadAllWorkspaces();

				let workspaceId = await window.ipcRenderer.invoke(
					"workspace-get-active-workspace-id",
				);

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

						const activeSelection = await window.ipcRenderer.invoke(
							"workspace-get-active-selection",
							workspaceId,
						);

						if (activeSelection?.worktreeId && activeSelection?.tabId) {
							setSelectedWorktreeId(activeSelection.worktreeId);
							setSelectedTabId(activeSelection.tabId);
						} else if (workspace.worktrees && workspace.worktrees.length > 0) {
							// Auto-select first worktree and its first tab if no selection exists
							const firstWorktree = workspace.worktrees[0];
							setSelectedWorktreeId(firstWorktree.id);
							if (firstWorktree.tabs && firstWorktree.tabs.length > 0) {
								setSelectedTabId(firstWorktree.tabs[0].id);
							}
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

	// Listen for workspace-opened event
	useEffect(() => {
		const handler = async (workspace: Workspace) => {
			console.log(
				"[NewLayoutMain] Workspace opened event received:",
				workspace,
			);
			setLoading(false);

			await window.ipcRenderer.invoke(
				"workspace-set-active-workspace-id",
				workspace.id,
			);
			await loadAllWorkspaces();

			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspace.id,
			);
			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);

				// Auto-select first worktree and tab if available
				if (refreshedWorkspace.worktrees && refreshedWorkspace.worktrees.length > 0) {
					const firstWorktree = refreshedWorkspace.worktrees[0];
					setSelectedWorktreeId(firstWorktree.id);
					if (firstWorktree.tabs && firstWorktree.tabs.length > 0) {
						setSelectedTabId(firstWorktree.tabs[0].id);
					}
				}
			}
		};

		window.ipcRenderer.on("workspace-opened", handler);
		return () => {
			window.ipcRenderer.off("workspace-opened", handler);
		};
	}, []);
	return (
		<>
			<Background />

			{/* Hover trigger area when sidebar is hidden */}
			{!isSidebarOpen && (
				<div
					className="fixed left-0 top-0 bottom-0 w-2 z-50"
					onMouseEnter={() => setShowSidebarOverlay(true)}
				/>
			)}

			{/* Sidebar overlay when hidden and hovering */}
			{!isSidebarOpen && showSidebarOverlay && workspaces && (
				<div
					className="fixed left-0 top-0 bottom-0 w-80 z-40 animate-in slide-in-from-left duration-200"
					onMouseLeave={() => setShowSidebarOverlay(false)}
				>
					<div className="h-full border-r border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">
						<WorktreeTabsSidebar
							worktree={selectedWorktree || null}
							selectedTabId={selectedTabId}
							onTabSelect={(tabId) => {
								if (selectedWorktreeId) {
									handleTabSelect(selectedWorktreeId, tabId);
								}
								setShowSidebarOverlay(false);
							}}
							onTabClose={async (tabId) => {
								if (!currentWorkspace || !selectedWorktreeId) return;

								const result = await window.ipcRenderer.invoke("tab-delete", {
									workspaceId: currentWorkspace.id,
									worktreeId: selectedWorktreeId,
									tabId,
								});

								if (result.success) {
									await handleWorktreeCreated();
								}
							}}
							onCreateTerminal={async () => {
								if (!currentWorkspace || !selectedWorktreeId) return;

								const result = await window.ipcRenderer.invoke("tab-create", {
									workspaceId: currentWorkspace.id,
									worktreeId: selectedWorktreeId,
									name: "Terminal",
									type: "terminal",
								});

								if (result.success && result.tab) {
									handleTabSelect(selectedWorktreeId, result.tab.id);
									await handleWorktreeCreated();
								}
								setShowSidebarOverlay(false);
							}}
							onCreatePreview={async () => {
								if (!currentWorkspace || !selectedWorktreeId) return;

								const result = await window.ipcRenderer.invoke("tab-create", {
									workspaceId: currentWorkspace.id,
									worktreeId: selectedWorktreeId,
									name: "Preview",
									type: "preview",
								});

								if (result.success && result.tab) {
									handleTabSelect(selectedWorktreeId, result.tab.id);
									await handleWorktreeCreated();
								}
								setShowSidebarOverlay(false);
							}}
							workspaceId={currentWorkspace?.id || null}
						/>
					</div>
				</div>
			)}

			<AppFrame>
				<div className="flex flex-col h-full w-full">
					{/* Worktree tabs at the top */}
					<TaskTabs
						onCollapseSidebar={handleCollapseSidebar}
						onExpandSidebar={handleExpandSidebar}
						isSidebarOpen={isSidebarOpen}
						worktrees={currentWorkspace?.worktrees || []}
						tasks={allTasks}
						selectedWorktreeId={selectedWorktreeId}
						onWorktreeSelect={(worktreeId) => {
							setSelectedWorktreeId(worktreeId);
							// Select first tab in the worktree
							const worktree = currentWorkspace?.worktrees?.find(wt => wt.id === worktreeId);
							if (worktree && worktree.tabs && worktree.tabs.length > 0) {
								handleTabSelect(worktreeId, worktree.tabs[0].id);
							}
						}}
						workspaceId={currentWorkspace?.id}
						onDeleteWorktree={handleDeleteWorktree}
						onAddTask={handleOpenAddTaskModal}
					/>

					{/* Main content area with resizable sidebar */}
					<div className="flex-1 overflow-hidden border-t border-neutral-700">
						<ResizablePanelGroup
							direction="horizontal"
							autoSaveId="new-layout-panels"
						>
							{/* Sidebar panel with full workspace/worktree management */}
							<ResizablePanel
								ref={sidebarPanelRef}
								defaultSize={20}
								minSize={15}
								maxSize={40}
								collapsible
								onCollapse={() => setIsSidebarOpen(false)}
								onExpand={() => setIsSidebarOpen(true)}
							>
								{isSidebarOpen && (
									<WorktreeTabsSidebar
										worktree={selectedWorktree || null}
										selectedTabId={selectedTabId}
										onTabSelect={(tabId) => {
											if (selectedWorktreeId) {
												handleTabSelect(selectedWorktreeId, tabId);
											}
										}}
										onTabClose={async (tabId) => {
											if (!currentWorkspace || !selectedWorktreeId) return;

											const result = await window.ipcRenderer.invoke("tab-delete", {
												workspaceId: currentWorkspace.id,
												worktreeId: selectedWorktreeId,
												tabId,
											});

											if (result.success) {
												await handleWorktreeCreated();
											}
										}}
										onCreateTerminal={async () => {
											if (!currentWorkspace || !selectedWorktreeId) return;

											const result = await window.ipcRenderer.invoke("tab-create", {
												workspaceId: currentWorkspace.id,
												worktreeId: selectedWorktreeId,
												name: "Terminal",
												type: "terminal",
											});

											if (result.success && result.tab) {
												handleTabSelect(selectedWorktreeId, result.tab.id);
												await handleWorktreeCreated();
											}
										}}
										onCreatePreview={async () => {
											if (!currentWorkspace || !selectedWorktreeId) return;

											const result = await window.ipcRenderer.invoke("tab-create", {
												workspaceId: currentWorkspace.id,
												worktreeId: selectedWorktreeId,
												name: "Preview",
												type: "preview",
											});

											if (result.success && result.tab) {
												handleTabSelect(selectedWorktreeId, result.tab.id);
												await handleWorktreeCreated();
											}
										}}
										workspaceId={currentWorkspace?.id || null}
									/>
								)}
							</ResizablePanel>

							<ResizableHandle withHandle />

							{/* Main content panel */}
							<ResizablePanel defaultSize={80} minSize={30}>
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
										key={`${parentGroupTab.id}-${JSON.stringify(parentGroupTab.mosaicTree)}-${parentGroupTab.tabs?.length}`}
										groupTab={parentGroupTab}
										workingDirectory={
											selectedWorktree.path || currentWorkspace.repoPath
										}
										workspaceId={currentWorkspace.id}
										worktreeId={selectedWorktreeId ?? undefined}
										selectedTabId={selectedTabId ?? undefined}
										onTabFocus={handleTabFocus}
										workspaceName={currentWorkspace.name}
										mainBranch={currentWorkspace.branch}
									/>
								) : selectedTab.type === "group" ? (
									// Selected tab is a group tab → display its mosaic layout
									<TabGroup
										key={`${selectedTab.id}-${JSON.stringify(selectedTab.mosaicTree)}-${selectedTab.tabs?.length}`}
										groupTab={selectedTab}
										workingDirectory={
											selectedWorktree.path || currentWorkspace.repoPath
										}
										workspaceId={currentWorkspace.id}
										worktreeId={selectedWorktreeId ?? undefined}
										selectedTabId={selectedTabId ?? undefined}
										onTabFocus={handleTabFocus}
										workspaceName={currentWorkspace.name}
										mainBranch={currentWorkspace.branch}
									/>
								) : selectedTab.type === "diff" ? (
									// Diff tab → display diff view
									<div className="w-full h-full">
										<DiffTab
											tab={selectedTab}
											workspaceId={currentWorkspace.id}
											worktreeId={selectedWorktreeId ?? ""}
											worktree={selectedWorktree}
											workspaceName={currentWorkspace.name}
											mainBranch={currentWorkspace.branch}
										/>
									</div>
								) : (
									// Base level tab (terminal, preview, etc.) → display full width/height
									<div className="w-full h-full p-2 bg-[#1e1e1e]">
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
											workspaceName={currentWorkspace.name}
											mainBranch={currentWorkspace.branch}
										/>
									</div>
								)}
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</div>
			</AppFrame>

			{/* Open Task Modal */}
			<AddTaskModal
				isOpen={isAddTaskModalOpen}
				onClose={handleCloseAddTaskModal}
				tasks={allTasks}
				openTasks={openTasks}
				onSelectTask={handleSelectTask}
				onCreateTask={handleCreateTask}
			/>

			{/* Delete Worktree Modal */}
			{deleteWorktreeInfo && currentWorkspace && (
				<DeleteWorktreeModal
					isOpen={!!deleteWorktreeId}
					onClose={() => {
						setDeleteWorktreeId(null);
						setDeleteWorktreeInfo(null);
					}}
					worktreeName={deleteWorktreeInfo.name}
					worktreePath={deleteWorktreeInfo.path}
					repoPath={currentWorkspace.repoPath}
					hasUncommittedChanges={deleteWorktreeInfo.hasUncommittedChanges}
					onConfirm={handleConfirmDelete}
				/>
			)}
			<Toaster />
		</>
	);
};
