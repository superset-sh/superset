import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import type { Tab, Workspace, Worktree } from "shared/types";
import { WorktreeProvider } from "../../../../contexts/WorktreeContext";
import { AppFrame } from "../AppFrame";
import { Background } from "../Background";
import TabContent from "../MainContent/TabContent";
import TabGroup from "../MainContent/TabGroup";
import { PlaceholderState } from "../PlaceholderState";
import { PlanView } from "../PlanView";
import { Sidebar } from "../Sidebar";
import { DiffTab } from "../TabContent/components/DiffTab";
import { AddTaskModal } from "./AddTaskModal";
import type { TaskStatus } from "./StatusIndicator";
import { TaskTabs, type WorktreeWithTask } from "./TaskTabs";
import { WorktreeTabView } from "./WorktreeTabView";

// Type alias for task data used in UI
type UITask = {
	id: string;
	slug: string;
	name: string;
	status: TaskStatus;
	branch: string;
	description: string;
	assignee: string;
	assigneeAvatarUrl: string;
	lastUpdated: string;
};

// Type for pending worktrees (optimistic updates)
type PendingWorktree = {
	id: string;
	isPending: true;
	title: string;
	branch: string;
	description?: string;
	taskData?: {
		slug: string;
		name: string;
		status: TaskStatus;
	};
};

// Mock tasks data - TODO: Replace with actual task data from backend
const MOCK_TASKS = [
	{
		id: "1",
		slug: "SSET-1",
		name: "Homepage Redesign",
		status: "working" as const,
		branch: "feature/homepage-redesign",
		description: "Redesigning the homepage with new branding and improved UX",
		assignee: "Alice",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=1",
		lastUpdated: "2 hours ago",
	},
	{
		id: "2",
		slug: "SSET-2",
		name: "API Integration",
		status: "needs-feedback" as const,
		branch: "feature/api-integration",
		description: "Integrate new REST API endpoints for user management",
		assignee: "Bob",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=12",
		lastUpdated: "1 day ago",
	},
	{
		id: "3",
		slug: "SSET-3",
		name: "Bug Fixes",
		status: "planning" as const,
		branch: "fix/various-bugs",
		description: "Collection of bug fixes reported by users",
		assignee: "Charlie",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=33",
		lastUpdated: "3 days ago",
	},
	{
		id: "4",
		slug: "SSET-4",
		name: "Performance Optimization",
		status: "ready-to-merge" as const,
		branch: "perf/optimize-queries",
		description: "Optimize database queries for faster page loads",
		assignee: "Diana",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=9",
		lastUpdated: "5 minutes ago",
	},
	{
		id: "5",
		slug: "SSET-5",
		name: "User Authentication System",
		status: "working" as const,
		branch: "feature/auth-system",
		description:
			"Implement OAuth2 and JWT-based authentication system with refresh tokens",
		assignee: "Eve",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=5",
		lastUpdated: "3 hours ago",
	},
	{
		id: "6",
		slug: "SSET-6",
		name: "Dark Mode Support",
		status: "planning" as const,
		branch: "feature/dark-mode",
		description: "Add dark mode theme support across the entire application",
		assignee: "Frank",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=13",
		lastUpdated: "2 days ago",
	},
	{
		id: "7",
		slug: "SSET-7",
		name: "Database Migration Scripts",
		status: "ready-to-merge" as const,
		branch: "db/migration-scripts",
		description:
			"Create automated migration scripts for production database updates",
		assignee: "Grace",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=20",
		lastUpdated: "1 hour ago",
	},
	{
		id: "8",
		slug: "SSET-8",
		name: "Email Notification Service",
		status: "needs-feedback" as const,
		branch: "feature/email-notifications",
		description:
			"Build email notification service using SendGrid for transactional emails",
		assignee: "Henry",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=8",
		lastUpdated: "4 hours ago",
	},
	{
		id: "9",
		slug: "SSET-9",
		name: "Mobile Responsive Design",
		status: "working" as const,
		branch: "feature/mobile-responsive",
		description:
			"Make the application fully responsive for mobile and tablet devices",
		assignee: "Iris",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=16",
		lastUpdated: "6 hours ago",
	},
	{
		id: "10",
		slug: "SSET-10",
		name: "Analytics Dashboard",
		status: "planning" as const,
		branch: "feature/analytics-dashboard",
		description:
			"Create admin dashboard with charts and metrics for user analytics",
		assignee: "Jack",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=11",
		lastUpdated: "1 week ago",
	},
	{
		id: "11",
		slug: "SSET-11",
		name: "CI/CD Pipeline",
		status: "ready-to-merge" as const,
		branch: "devops/ci-cd-pipeline",
		description:
			"Set up automated CI/CD pipeline with GitHub Actions and Docker",
		assignee: "Kate",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=25",
		lastUpdated: "30 minutes ago",
	},
	{
		id: "12",
		slug: "SSET-12",
		name: "Search Functionality",
		status: "working" as const,
		branch: "feature/search",
		description: "Implement full-text search with Elasticsearch integration",
		assignee: "Liam",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=14",
		lastUpdated: "5 hours ago",
	},
	{
		id: "13",
		slug: "SSET-13",
		name: "File Upload System",
		status: "needs-feedback" as const,
		branch: "feature/file-uploads",
		description:
			"Build secure file upload system with S3 storage and virus scanning",
		assignee: "Mia",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=27",
		lastUpdated: "2 hours ago",
	},
	{
		id: "14",
		slug: "SSET-14",
		name: "API Rate Limiting",
		status: "planning" as const,
		branch: "feature/rate-limiting",
		description: "Implement rate limiting and throttling for API endpoints",
		assignee: "Noah",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=17",
		lastUpdated: "4 days ago",
	},
	{
		id: "15",
		slug: "SSET-15",
		name: "Internationalization",
		status: "working" as const,
		branch: "feature/i18n",
		description:
			"Add multi-language support with i18next for English, Spanish, and French",
		assignee: "Olivia",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=32",
		lastUpdated: "8 hours ago",
	},
];

// Helper function to enrich worktrees with task metadata
function enrichWorktreesWithTasks(
	worktrees: Worktree[],
	pendingWorktrees: PendingWorktree[],
): WorktreeWithTask[] {
	// First, convert pending worktrees to WorktreeWithTask format
	const pendingAsWorktrees: WorktreeWithTask[] = pendingWorktrees.map(
		(pending) => ({
			id: pending.id,
			branch: pending.branch,
			path: "", // Pending worktrees don't have a path yet
			tabs: [],
			createdAt: new Date().toISOString(),
			isPending: true, // Mark as pending for UI
			task: pending.taskData
				? {
					id: pending.id,
					slug: pending.taskData.slug,
					title: pending.taskData.name,
					status: pending.taskData.status,
					description: pending.description || "",
				}
				: undefined,
		}),
	);

	// Then, enrich real worktrees with task metadata
	const enrichedWorktrees = worktrees.map((worktree) => {
		// Try to find a matching task by branch name
		const matchingTask = MOCK_TASKS.find(
			(task) => task.branch === worktree.branch,
		);

		if (matchingTask) {
			// Worktree has an associated task - add task metadata
			return {
				...worktree,
				task: {
					id: matchingTask.id,
					slug: matchingTask.slug,
					title: matchingTask.name,
					status: matchingTask.status,
					description: matchingTask.description,
					assignee: {
						name: matchingTask.assignee,
						avatarUrl: matchingTask.assigneeAvatarUrl,
					},
					lastUpdated: matchingTask.lastUpdated,
				},
			};
		}

		// Worktree without task - return as-is
		return worktree;
	});

	// Merge pending and real worktrees
	return [...pendingAsWorktrees, ...enrichedWorktrees];
}

export const NewLayoutMain: React.FC = () => {
	const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);
	const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);

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
	const [mode, setMode] = useState<"plan" | "edit">("edit");
	const [pendingWorktrees, setPendingWorktrees] = useState<PendingWorktree[]>(
		[],
	);

	// Compute which tasks have worktrees (are "open")
	const openTasks = MOCK_TASKS.filter((task) =>
		currentWorkspace?.worktrees?.some((wt) => wt.branch === task.branch),
	);

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

	// Optimistically add a tab to the current workspace
	const handleTabCreated = (worktreeId: string, tab: Tab) => {
		if (!currentWorkspace) return;

		// Find the worktree and add the tab
		const updatedWorktrees = currentWorkspace.worktrees.map((wt) => {
			if (wt.id === worktreeId) {
				return {
					...wt,
					tabs: [...wt.tabs, tab],
				};
			}
			return wt;
		});

		const updatedWorkspace = {
			...currentWorkspace,
			worktrees: updatedWorktrees,
			activeWorktreeId: worktreeId,
			activeTabId: tab.id,
		};

		setCurrentWorkspace(updatedWorkspace);

		// Also update in workspaces array
		if (workspaces) {
			setWorkspaces(
				workspaces.map((ws) =>
					ws.id === currentWorkspace.id ? updatedWorkspace : ws,
				),
			);
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

	const handleSelectTask = (task: UITask) => {
		if (!currentWorkspace) return;

		// Find existing worktree for this task's branch
		const existingWorktree = currentWorkspace.worktrees?.find(
			(wt) => wt.branch === task.branch,
		);

		if (existingWorktree) {
			// Worktree already exists - switch to it
			setSelectedWorktreeId(existingWorktree.id);
			if (existingWorktree.tabs && existingWorktree.tabs.length > 0) {
				handleTabSelect(existingWorktree.id, existingWorktree.tabs[0].id);
			}
			handleCloseAddTaskModal();
		} else {
			// Worktree doesn't exist - create it with optimistic update
			const pendingId = `pending-${Date.now()}`;
			const pendingWorktree: PendingWorktree = {
				id: pendingId,
				isPending: true,
				title: task.name,
				branch: task.branch,
				description: task.description,
				taskData: {
					slug: task.slug,
					name: task.name,
					status: task.status,
				},
			};

			// Add pending worktree immediately
			setPendingWorktrees((prev) => [...prev, pendingWorktree]);
			handleCloseAddTaskModal();

			void (async () => {
				try {
					const result = await window.ipcRenderer.invoke("worktree-create", {
						workspaceId: currentWorkspace.id,
						title: task.name,
						branch: task.branch,
						createBranch: false, // Branch should already exist
						description: task.description,
					});

					if (result.success && result.worktree) {
						// Remove pending worktree
						setPendingWorktrees((prev) =>
							prev.filter((wt) => wt.id !== pendingId),
						);
						// Refresh workspace to get the real worktree
						await handleWorktreeCreated();
						setSelectedWorktreeId(result.worktree.id);
						if (result.worktree.tabs && result.worktree.tabs.length > 0) {
							handleTabSelect(result.worktree.id, result.worktree.tabs[0].id);
						}
					} else {
						// Remove pending on failure
						setPendingWorktrees((prev) =>
							prev.filter((wt) => wt.id !== pendingId),
						);
					}
				} catch (error) {
					console.error("Failed to create worktree for task:", error);
					// Remove pending on error
					setPendingWorktrees((prev) =>
						prev.filter((wt) => wt.id !== pendingId),
					);
				}
			})();
		}
	};

	const handleCreateTask = (taskData: {
		name: string;
		description: string;
		status: TaskStatus;
		assignee: string;
		branch: string;
	}) => {
		if (!currentWorkspace) return;

		// Create pending worktree for optimistic update
		const pendingId = `pending-${Date.now()}`;
		const pendingWorktree: PendingWorktree = {
			id: pendingId,
			isPending: true,
			title: taskData.name,
			branch: taskData.branch,
			description: taskData.description,
			taskData: {
				slug: "...", // Will be generated by backend
				name: taskData.name,
				status: taskData.status,
			},
		};

		// Add pending worktree immediately
		setPendingWorktrees((prev) => [...prev, pendingWorktree]);
		handleCloseAddTaskModal();

		void (async () => {
			try {
				// Create a worktree for this task
				const result = await window.ipcRenderer.invoke("worktree-create", {
					workspaceId: currentWorkspace.id,
					title: taskData.name,
					branch: taskData.branch,
					createBranch: true,
					description: taskData.description,
				});

				if (result.success && result.worktree) {
					// Remove pending worktree
					setPendingWorktrees((prev) =>
						prev.filter((wt) => wt.id !== pendingId),
					);

					// Reload workspace to get the new worktree
					await handleWorktreeCreated();

					// Switch to the new worktree
					setSelectedWorktreeId(result.worktree.id);

					// Select first tab if available
					if (result.worktree.tabs && result.worktree.tabs.length > 0) {
						handleTabSelect(result.worktree.id, result.worktree.tabs[0].id);
					}
				} else {
					// Remove pending on failure
					setPendingWorktrees((prev) =>
						prev.filter((wt) => wt.id !== pendingId),
					);
				}
			} catch (error) {
				console.error("Failed to create task/worktree:", error);
				// Remove pending on error
				setPendingWorktrees((prev) => prev.filter((wt) => wt.id !== pendingId));
			}
		})();
	};

	const handleCreatePR = async () => {
		if (!currentWorkspace || !selectedWorktreeId) return;

		const worktree = currentWorkspace.worktrees?.find(
			(wt) => wt.id === selectedWorktreeId,
		);
		if (!worktree) return;

		try {
			const result = await window.ipcRenderer.invoke("worktree-create-pr", {
				workspaceId: currentWorkspace.id,
				worktreeId: selectedWorktreeId,
			});

			if (result.success) {
				// Reload workspace to show updated PR state
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				);
				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}

				// Open PR URL in default browser only if we have a valid URL
				// (--web mode opens browser automatically, so we don't need to open it again)
				if (result.prUrl && result.prUrl.startsWith("http")) {
					await window.ipcRenderer.invoke("open-external", result.prUrl);
				}
			} else {
				// Show error as alert
				alert(`Failed to create PR: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			alert(`Failed to create PR: ${errorMessage}`);
		}
	};

	const handleMergePR = async () => {
		if (!currentWorkspace || !selectedWorktreeId) return;

		const worktree = currentWorkspace.worktrees?.find(
			(wt) => wt.id === selectedWorktreeId,
		);
		if (!worktree) return;

		try {
			const result = await window.ipcRenderer.invoke("worktree-merge-pr", {
				workspaceId: currentWorkspace.id,
				worktreeId: selectedWorktreeId,
			});

			if (result.success) {
				// Reload workspace to show updated state
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				);
				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
				alert("PR merged successfully!");
			} else {
				// Show error as alert
				alert(`Failed to merge PR: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			alert(`Failed to merge PR: ${errorMessage}`);
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
						<Sidebar
							workspaces={workspaces}
							currentWorkspace={currentWorkspace}
							onTabSelect={handleTabSelect}
							onWorktreeCreated={handleWorktreeCreated}
							onWorkspaceSelect={handleWorkspaceSelect}
							onUpdateWorktree={handleUpdateWorktree}
							selectedTabId={selectedTabId ?? undefined}
							selectedWorktreeId={selectedWorktreeId}
							onCollapse={() => {
								setShowSidebarOverlay(false);
							}}
							onShowDiff={handleShowDiff}
						/>
					</div>
				</div>
			)}

			<AppFrame>
				<div className="flex flex-col h-full w-full">
					{/* Worktree tabs at the top - each tab represents a worktree */}
					<TaskTabs
						onCollapseSidebar={handleCollapseSidebar}
						onExpandSidebar={handleExpandSidebar}
						isSidebarOpen={isSidebarOpen}
						onAddTask={handleOpenAddTaskModal}
						onCreatePR={handleCreatePR}
						onMergePR={handleMergePR}
						worktrees={enrichWorktreesWithTasks(
							currentWorkspace?.worktrees || [],
							pendingWorktrees,
						)}
						selectedWorktreeId={selectedWorktreeId}
						onWorktreeSelect={(worktreeId) => {
							// Don't allow selecting pending worktrees
							if (worktreeId.startsWith("pending-")) return;

							setSelectedWorktreeId(worktreeId);
							// Select first tab in the worktree
							const worktree = currentWorkspace?.worktrees?.find(
								(wt) => wt.id === worktreeId,
							);
							if (worktree && worktree.tabs && worktree.tabs.length > 0) {
								handleTabSelect(worktreeId, worktree.tabs[0].id);
							}
						}}
						mode={mode}
						onModeChange={setMode}
					/>

					{/* Main content area - conditionally render based on mode */}
					<div className="flex-1 overflow-hidden">
						{mode === "plan" ? (
							// Plan mode - show kanban board
							<PlanView
								currentWorkspace={currentWorkspace}
								selectedWorktreeId={selectedWorktreeId}
								onTabSelect={handleTabSelect}
								onTabCreated={handleTabCreated}
							/>
						) : (
							// Edit mode - show workspace/terminal view
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
									{isSidebarOpen && workspaces && (
										<Sidebar
											workspaces={workspaces}
											currentWorkspace={currentWorkspace}
											onTabSelect={handleTabSelect}
											onWorktreeCreated={handleWorktreeCreated}
											onWorkspaceSelect={handleWorkspaceSelect}
											onUpdateWorktree={handleUpdateWorktree}
											selectedTabId={selectedTabId ?? undefined}
											selectedWorktreeId={selectedWorktreeId}
											onCollapse={() => {
												const panel = sidebarPanelRef.current;
												if (panel && !panel.isCollapsed()) {
													panel.collapse();
												}
											}}
											onShowDiff={handleShowDiff}
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
						)}
					</div>
				</div>
			</AppFrame>

			{/* Open Task Modal */}
			<AddTaskModal
				isOpen={isAddTaskModalOpen}
				onClose={handleCloseAddTaskModal}
				tasks={MOCK_TASKS}
				openTasks={openTasks}
				onSelectTask={handleSelectTask}
				onCreateTask={handleCreateTask}
			/>
		</>
	);
};
