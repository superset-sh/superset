import type { MotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import type { WorkspaceRef } from "shared/electron-store";
import type { Worktree, Workspace } from "shared/runtime-types";
import {
	CreateWorktreeButton,
	CreateWorktreeModal,
	SidebarHeader,
	WorkspaceCarousel,
	WorkspaceSwitcher,
	WorktreeList,
} from "./components";

interface SidebarProps {
	workspaces: WorkspaceRef[];
	currentWorkspace: Workspace | null;
	onCollapse: () => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabGroupSelect: (worktreeId: string, tabGroupId: string) => void;
	onWorktreeCreated?: () => void;
	onWorkspaceSelect: (workspaceId: string) => void;
	onUpdateWorktree: () => void;
	onScanWorktrees: () => Promise<{ success: boolean; imported?: number }>;
	onCreateWorktree: (
		branch: string,
		createBranch: boolean,
	) => Promise<{ success: boolean; error?: string }>;
	selectedTabId?: string;
	selectedTabGroupId?: string;
}

export function Sidebar({
	workspaces,
	currentWorkspace,
	onCollapse,
	onTabSelect,
	onTabGroupSelect,
	onWorktreeCreated,
	onWorkspaceSelect,
	onUpdateWorktree,
	onScanWorktrees,
	onCreateWorktree,
	selectedTabId,
	selectedTabGroupId,
}: SidebarProps) {
	const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(
		new Set(),
	);
	const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
	const [isScanningWorktrees, setIsScanningWorktrees] = useState(false);
	const [showWorktreeModal, setShowWorktreeModal] = useState(false);
	const [branchName, setBranchName] = useState("");
	const [scrollProgress, setScrollProgress] = useState<
		MotionValue<number> | undefined
	>();

	// Auto-expand worktree if it contains the selected tab group
	useEffect(() => {
		if (currentWorkspace && selectedTabGroupId) {
			// Find which worktree contains the selected tab group
			const worktreeWithSelectedTabGroup = currentWorkspace.worktrees?.find(
				(worktree) =>
					worktree.tabGroups?.some((tg) => tg.id === selectedTabGroupId),
			);

			if (worktreeWithSelectedTabGroup) {
				setExpandedWorktrees((prev) => {
					const next = new Set(prev);
					next.add(worktreeWithSelectedTabGroup.id);
					return next;
				});
			}
		}
	}, [currentWorkspace, selectedTabGroupId]);

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
		setShowWorktreeModal(true);
	};

	const handleSubmitWorktree = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!currentWorkspace || !branchName.trim()) return;

		setIsCreatingWorktree(true);

		try {
			const result = await onCreateWorktree(branchName.trim(), true);

			if (result.success) {
				setShowWorktreeModal(false);
				setBranchName("");
				onWorktreeCreated?.();
			} else {
				alert(`Failed to create worktree: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			console.error("[Sidebar] Error creating worktree:", error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsCreatingWorktree(false);
		}
	};

	const handleCancelWorktree = () => {
		setShowWorktreeModal(false);
		setBranchName("");
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

		setIsScanningWorktrees(true);

		try {
			const result = await onScanWorktrees();

			if (result.success && result.imported && result.imported > 0) {
				onWorktreeCreated?.();
			}
		} catch (error) {
			console.error("[Sidebar] Error scanning worktrees:", error);
		} finally {
			setIsScanningWorktrees(false);
		}
	};

	return (
		<div className="flex flex-col h-full w-64 select-none text-neutral-300">
			<SidebarHeader
				onCollapse={onCollapse}
				onScanWorktrees={handleScanWorktrees}
				isScanningWorktrees={isScanningWorktrees}
				hasWorkspace={!!currentWorkspace}
			/>

			<WorkspaceCarousel
				workspaces={workspaces}
				currentWorkspace={currentWorkspace}
				onWorkspaceSelect={onWorkspaceSelect}
				onScrollProgress={setScrollProgress}
			>
				{(workspace, isActive) => (
					<>
						<WorktreeList
							currentWorkspace={workspace}
							expandedWorktrees={expandedWorktrees}
							onToggleWorktree={toggleWorktree}
							onTabSelect={onTabSelect}
							onTabGroupSelect={onTabGroupSelect}
							onReload={onUpdateWorktree}
							onUpdateWorktree={() => {
								// Worktree updates are not persisted in new architecture
								// Just refresh workspace data from git
								onUpdateWorktree();
							}}
							selectedTabId={selectedTabId}
							selectedTabGroupId={selectedTabGroupId}
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

			<WorkspaceSwitcher
				workspaces={workspaces}
				currentWorkspaceId={currentWorkspace?.id || null}
				onWorkspaceSelect={onWorkspaceSelect}
				onAddWorkspace={handleAddWorkspace}
				onRemoveWorkspace={handleRemoveWorkspace}
				scrollProgress={scrollProgress}
			/>

			<CreateWorktreeModal
				isOpen={showWorktreeModal}
				onClose={handleCancelWorktree}
				onSubmit={handleSubmitWorktree}
				isCreating={isCreatingWorktree}
				branchName={branchName}
				onBranchNameChange={setBranchName}
			/>
		</div>
	);
}
