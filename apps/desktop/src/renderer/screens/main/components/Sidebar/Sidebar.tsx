import { type MotionValue, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import type { Workspace, Worktree } from "shared/types";
import {
	CreateWorktreeButton,
	CreateWorktreeModal,
	SidebarHeader,
	WorkspaceCarousel,
	WorkspacePortIndicator,
	WorkspaceSwitcher,
	WorktreeList,
} from "./components";

interface SidebarProps {
	workspaces: Workspace[];
	currentWorkspace: Workspace | null;
	onCollapse: () => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onWorktreeCreated: () => void;
	onWorkspaceSelect: (workspaceId: string) => void;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
	isDragging?: boolean;
	onShowDiff?: (worktreeId: string) => void;
}

export function Sidebar({
	workspaces,
	currentWorkspace,
	onCollapse,
	onTabSelect,
	onWorktreeCreated,
	onWorkspaceSelect,
	onUpdateWorktree,
	selectedTabId,
	isDragging = false,
	onShowDiff,
}: SidebarProps) {
	const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(
		new Set(),
	);
	const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
	const [isScanningWorktrees, setIsScanningWorktrees] = useState(false);
	const [showWorktreeModal, setShowWorktreeModal] = useState(false);
	const [title, setTitle] = useState("");
	const [branchName, setBranchName] = useState("");
	const [branches, setBranches] = useState<string[]>([]);
	const [sourceBranch, setSourceBranch] = useState("");
	const [cloneTabsFromWorktreeId, setCloneTabsFromWorktreeId] = useState("");
	const [description, setDescription] = useState("");
	const [setupStatus, setSetupStatus] = useState<string | undefined>(undefined);
	const [setupOutput, setSetupOutput] = useState<string | undefined>(undefined);

	// Initialize with current workspace index
	const currentIndex = workspaces.findIndex(
		(w) => w.id === currentWorkspace?.id,
	);
	const initialIndex = currentIndex >= 0 ? currentIndex : 0;
	const defaultScrollProgress = useMotionValue(initialIndex);
	const [scrollProgress, setScrollProgress] = useState<MotionValue<number>>(
		defaultScrollProgress,
	);

	// Auto-expand worktree if it contains the selected tab
	useEffect(() => {
		if (currentWorkspace && selectedTabId) {
			// Find which worktree contains the selected tab (recursively search through tabs)
			const findWorktreeWithTab = (tabId: string) => {
				return currentWorkspace.worktrees?.find((worktree) => {
					const searchTabs = (tabs: any[]): boolean => {
						for (const tab of tabs) {
							if (tab.id === tabId) return true;
							if (tab.type === "group" && tab.tabs) {
								if (searchTabs(tab.tabs)) return true;
							}
						}
						return false;
					};
					return searchTabs(worktree.tabs || []);
				});
			};

			const worktreeWithSelectedTab = findWorktreeWithTab(selectedTabId);

			if (worktreeWithSelectedTab) {
				setExpandedWorktrees((prev) => {
					const next = new Set(prev);
					next.add(worktreeWithSelectedTab.id);
					return next;
				});
			}
		}
	}, [currentWorkspace, selectedTabId]);

	// Fetch branches when modal opens
	useEffect(() => {
		if (showWorktreeModal && currentWorkspace) {
			const fetchBranches = async () => {
				const result = await window.ipcRenderer.invoke(
					"workspace-list-branches",
					currentWorkspace.id,
				);
				setBranches(result.branches);
				// Only set default source branch if not already set (e.g., from clone operation)
				if (!sourceBranch) {
					setSourceBranch(result.currentBranch || result.branches[0] || "");
				}
			};
			fetchBranches();
		}
	}, [showWorktreeModal, currentWorkspace, sourceBranch]);

	const toggleWorktree = (worktreeId: string) => {
		setExpandedWorktrees((prev) => {
			const next = new Set(prev);
			if (next.has(worktreeId)) {
				next.delete(worktreeId);
			} else {
				next.add(worktreeId);
			}
			return next;
		});
	};

	const handleCreateWorktree = () => {
		// Reset modal state for creating a new worktree (not cloning)
		setTitle("");
		setBranchName("");
		setSourceBranch("");
		setCloneTabsFromWorktreeId("");
		setDescription("");
		setShowWorktreeModal(true);
	};

	const handleCloneWorktree = (worktreeId: string, branch: string) => {
		// Pre-populate modal for cloning: use the clicked worktree's branch as source
		// and clone its tabs to the new worktree
		setTitle("");
		setBranchName("");
		setSourceBranch(branch);
		setCloneTabsFromWorktreeId(worktreeId);
		setShowWorktreeModal(true);
	};

	const handleSubmitWorktree = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!currentWorkspace || !title.trim()) return;

		console.log("[Sidebar] Creating worktree:", {
			title,
			branch: branchName.trim() || undefined,
			createBranch: true,
		});
		setIsCreatingWorktree(true);
		setSetupStatus("Creating git worktree...");
		setSetupOutput(undefined);

		// Listen for setup progress events
		const progressHandler = (data: any) => {
			if (data && data.status !== undefined && data.output !== undefined) {
				setSetupStatus(data.status);
				setSetupOutput(data.output);
			}
		};
		window.ipcRenderer.on("worktree-setup-progress", progressHandler);

		try {
			// Type-safe IPC call - no need for type assertion!
			const result = await window.ipcRenderer.invoke("worktree-create", {
				workspaceId: currentWorkspace.id,
				title: title.trim(),
				...(branchName.trim() && { branch: branchName.trim() }),
				createBranch: true,
				sourceBranch: sourceBranch,
				...(cloneTabsFromWorktreeId && { cloneTabsFromWorktreeId }),
				...(description.trim() && { description: description.trim() }),
			});

			if (result.success) {
				// Display setup result if available
				if (result.setupResult) {
					setSetupStatus(
						result.setupResult.success
							? "Setup completed successfully!"
							: "Setup completed with errors",
					);
					setSetupOutput(result.setupResult.output);

					// Keep modal open for 1.5 seconds to show result
					await new Promise((resolve) => setTimeout(resolve, 1500));
				}

				// Reset modal state and close
				setShowWorktreeModal(false);
				setTitle("");
				setBranchName("");
				setSourceBranch("");
				setCloneTabsFromWorktreeId("");
				setDescription("");
				setSetupStatus(undefined);
				setSetupOutput(undefined);
				onWorktreeCreated();
			} else {
				console.error("[Sidebar] Failed to create worktree:", result.error);
				setSetupStatus("Failed to create worktree");
				setSetupOutput(result.error);
				// Don't close modal on error so user can see what went wrong
			}
		} catch (error) {
			console.error("[Sidebar] Error creating worktree:", error);
			setSetupStatus("Error creating worktree");
			setSetupOutput(error instanceof Error ? error.message : String(error));
			// Don't close modal on error so user can see what went wrong
		} finally {
			// Clean up event listener
			window.ipcRenderer.off("worktree-setup-progress", progressHandler);
			setIsCreatingWorktree(false);
		}
	};

	const handleCancelWorktree = () => {
		setShowWorktreeModal(false);
		setTitle("");
		setBranchName("");
		setSourceBranch("");
		setCloneTabsFromWorktreeId("");
		setDescription("");
		setSetupStatus(undefined);
		setSetupOutput(undefined);
	};

	const handleAddWorkspace = () => {
		// Trigger the File -> Open Repository menu action
		window.ipcRenderer.send("open-repository");
	};

	const handleRemoveWorkspace = async (
		workspaceId: string,
		workspaceName: string,
	) => {
		// Confirm deletion
		const confirmed = window.confirm(
			`Remove workspace "${workspaceName}"?\n\nAll terminal sessions for this workspace will be closed.`,
		);

		if (!confirmed) return;

		try {
			const result = await window.ipcRenderer.invoke("workspace-delete", {
				id: workspaceId,
				removeWorktree: false,
			});
			if (result.success) {
				// If we deleted the current workspace, clear selection
				if (currentWorkspace?.id === workspaceId) {
					onWorkspaceSelect("");
				}
				// Refresh will happen via workspace-opened event
				window.location.reload();
			} else {
				alert(`Failed to remove workspace: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			console.error("Error removing workspace:", error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleScanWorktrees = async () => {
		if (!currentWorkspace) return;

		console.log(
			"[Sidebar] Scanning worktrees for workspace:",
			currentWorkspace.id,
		);
		setIsScanningWorktrees(true);

		try {
			const result = (await window.ipcRenderer.invoke(
				"workspace-scan-worktrees",
				currentWorkspace.id,
			)) as { success: boolean; imported?: number; error?: string };

			if (result.success) {
				console.log("[Sidebar] Scan completed, imported:", result.imported);
				if (result.imported && result.imported > 0) {
					onWorktreeCreated();
				}
			} else {
				console.error("[Sidebar] Failed to scan worktrees:", result.error);
			}
		} catch (error) {
			console.error("[Sidebar] Error scanning worktrees:", error);
		} finally {
			setIsScanningWorktrees(false);
		}
	};

	return (
		<div className="flex flex-col h-full w-full select-none text-neutral-300 text-sm">
			<WorkspaceCarousel
				workspaces={workspaces}
				currentWorkspace={currentWorkspace}
				onWorkspaceSelect={onWorkspaceSelect}
				onScrollProgress={setScrollProgress}
				isDragging={isDragging}
			>
				{(workspace, isActive) => (
					<>
						<WorktreeList
							currentWorkspace={workspace}
							expandedWorktrees={expandedWorktrees}
							onToggleWorktree={toggleWorktree}
							onTabSelect={onTabSelect}
							onReload={onWorktreeCreated}
							onUpdateWorktree={onUpdateWorktree}
							selectedTabId={selectedTabId}
							onCloneWorktree={handleCloneWorktree}
							onShowDiff={onShowDiff}
							selectedWorktreeId={currentWorkspace?.activeWorktreeId}
							showWorkspaceHeader={true}
						/>

						{workspace && (
							<CreateWorktreeButton
								onClick={handleCreateWorktree}
								isCreating={isCreatingWorktree}
							/>
						)}
					</>
				)}
			</WorkspaceCarousel>

			<CreateWorktreeModal
				isOpen={showWorktreeModal}
				onClose={handleCancelWorktree}
				onSubmit={handleSubmitWorktree}
				isCreating={isCreatingWorktree}
				title={title}
				onTitleChange={setTitle}
				branchName={branchName}
				onBranchNameChange={setBranchName}
				branches={branches}
				sourceBranch={sourceBranch}
				onSourceBranchChange={setSourceBranch}
				worktrees={currentWorkspace?.worktrees || []}
				cloneTabsFromWorktreeId={cloneTabsFromWorktreeId}
				onCloneTabsFromWorktreeIdChange={setCloneTabsFromWorktreeId}
				description={description}
				onDescriptionChange={setDescription}
				setupStatus={setupStatus}
				setupOutput={setupOutput}
			/>
		</div>
	);
}
