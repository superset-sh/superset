import type React from "react";
import type { Workspace, Worktree } from "shared/types";

interface UseWorktreesProps {
	currentWorkspace: Workspace | null;
	setCurrentWorkspace: (workspace: Workspace) => void;
	setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[] | null>>;
	loadAllWorkspaces: () => Promise<void>;
	setSelectedWorktreeId: (id: string | null) => void;
	setSelectedTabId: (id: string | null) => void;
}

export function useWorktrees({
	currentWorkspace,
	setCurrentWorkspace,
	setWorkspaces,
	loadAllWorkspaces,
	setSelectedWorktreeId,
	setSelectedTabId,
}: UseWorktreesProps) {
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

		// Also update in workspaces array if available
		setWorkspaces((prev) => {
			if (!prev) return [];
			return prev.map((ws) =>
				ws.id === currentWorkspace.id ? updatedCurrentWorkspace : ws,
			);
		});
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

	const handleCreatePR = async (selectedWorktreeId: string | null) => {
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
				if (result.prUrl?.startsWith("http")) {
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

	const handleMergePR = async (selectedWorktreeId: string | null) => {
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

	return {
		handleWorktreeCreated,
		handleUpdateWorktree,
		handleShowDiff,
		handleCreatePR,
		handleMergePR,
	};
}

