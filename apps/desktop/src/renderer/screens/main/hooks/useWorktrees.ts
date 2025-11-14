import type React from "react";
import type { Workspace, Worktree } from "shared/types";

interface UseWorktreesProps {
	currentWorkspace: Workspace | null;
	setCurrentWorkspace: (workspace: Workspace) => void;
	setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[] | null>>;
	loadAllWorkspaces: () => Promise<void>;
	selectedWorktreeId: string | null;
	setSelectedWorktreeId: (id: string | null) => void;
	setSelectedTabId: (id: string | null) => void;
}

export function useWorktrees({
	currentWorkspace,
	setCurrentWorkspace,
	setWorkspaces,
	loadAllWorkspaces,
	selectedWorktreeId,
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

	const handleDeleteWorktree = async (worktreeId: string) => {
		if (!currentWorkspace) return;

		try {
			const result = await window.ipcRenderer.invoke("worktree-remove", {
				workspaceId: currentWorkspace.id,
				worktreeId,
			});

			if (result.success) {
				// Reload workspace to get updated worktree list
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				);

				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
					await loadAllWorkspaces();

					// If we deleted the selected worktree, select the first available one
					if (selectedWorktreeId === worktreeId) {
						if (refreshedWorkspace.worktrees && refreshedWorkspace.worktrees.length > 0) {
							const firstWorktree = refreshedWorkspace.worktrees[0];
							setSelectedWorktreeId(firstWorktree.id);
							if (firstWorktree.tabs && firstWorktree.tabs.length > 0) {
								setSelectedTabId(firstWorktree.tabs[0].id);
							} else {
								setSelectedTabId(null);
							}
						} else {
							setSelectedWorktreeId(null);
							setSelectedTabId(null);
						}
					}
				}
			} else {
				console.error("Failed to remove worktree:", result.error);
				alert(`Failed to remove worktree: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			console.error("Error removing worktree:", error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	return {
		handleWorktreeCreated,
		handleUpdateWorktree,
		handleCreatePR,
		handleMergePR,
		handleDeleteWorktree,
	};
}

