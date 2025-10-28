import { useEffect, useState } from "react";
import type { Workspace } from "shared/types";
import {
	SidebarHeader,
	WorktreeList,
	CreateWorktreeButton,
	WorkspaceSwitcher,
	CreateWorktreeModal,
} from "./components";

interface SidebarProps {
	workspaces: Workspace[];
	currentWorkspace: Workspace | null;
	onCollapse: () => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabGroupSelect: (worktreeId: string, tabGroupId: string) => void;
	onWorktreeCreated?: () => void;
	onWorkspaceSelect: (workspaceId: string) => void;
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
		console.log("[Sidebar] New Worktree button clicked");
		setShowWorktreeModal(true);
	};

	const handleSubmitWorktree = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!currentWorkspace || !branchName.trim()) return;

		console.log("[Sidebar] Creating worktree:", {
			branchName,
			createBranch: true,
		});
		setIsCreatingWorktree(true);

		try {
			const result = (await window.ipcRenderer.invoke("worktree-create", {
				currentWorkspaceId: currentWorkspace.id,
				branch: branchName.trim(),
				createBranch: true,
			})) as { success: boolean; error?: string };

			if (result.success) {
				console.log("[Sidebar] Worktree created successfully");
				setShowWorktreeModal(false);
				setBranchName("");
				onWorktreeCreated?.();
			} else {
				console.error("[Sidebar] Failed to create worktree:", result.error);
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
			const result = await window.ipcRenderer.invoke(
				"workspace-delete",
				workspaceId,
				false,
			);
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
					onWorktreeCreated?.();
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
		<div className="flex flex-col h-full w-64 select-none text-neutral-300">
			<SidebarHeader
				onCollapse={onCollapse}
				onScanWorktrees={handleScanWorktrees}
				isScanningWorktrees={isScanningWorktrees}
				hasWorkspace={!!currentWorkspace}
			/>

			<div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
				<WorktreeList
					currentWorkspace={currentWorkspace}
					expandedWorktrees={expandedWorktrees}
					onToggleWorktree={toggleWorktree}
					onTabSelect={onTabSelect}
					onTabGroupSelect={onTabGroupSelect}
					selectedTabId={selectedTabId}
					selectedTabGroupId={selectedTabGroupId}
				/>

				{currentWorkspace && (
					<CreateWorktreeButton
						onClick={handleCreateWorktree}
						isCreating={isCreatingWorktree}
					/>
				)}
			</div>

			<WorkspaceSwitcher
				workspaces={workspaces}
				currentWorkspaceId={currentWorkspace?.id || null}
				onWorkspaceSelect={onWorkspaceSelect}
				onAddWorkspace={handleAddWorkspace}
				onRemoveWorkspace={handleRemoveWorkspace}
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
