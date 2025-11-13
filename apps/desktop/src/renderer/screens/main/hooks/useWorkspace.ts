import { useEffect, useState } from "react";
import type { Workspace } from "shared/types";

interface UseWorkspaceProps {
	setSelectedWorktreeId?: (id: string | null) => void;
	setSelectedTabId?: (id: string | null) => void;
}

export function useWorkspace({
	setSelectedWorktreeId,
	setSelectedTabId,
}: UseWorkspaceProps = {}) {
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showWorkspaceSelection, setShowWorkspaceSelection] = useState(false);

	// Load all workspaces
	const loadAllWorkspaces = async () => {
		try {
			const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");
			setWorkspaces(allWorkspaces);
		} catch (error) {
			console.error("Failed to load workspaces:", error);
		}
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
				// Set window-specific workspace
				await window.ipcRenderer.invoke(
					"workspace-set-window-workspace-id",
					workspaceId,
				);
				// Also update global active workspace for backward compatibility
				await window.ipcRenderer.invoke(
					"workspace-set-active-workspace-id",
					workspaceId,
				);

				const activeSelection = await window.ipcRenderer.invoke(
					"workspace-get-active-selection",
					workspaceId,
				);

				if (activeSelection?.worktreeId && activeSelection?.tabId) {
					setSelectedWorktreeId?.(activeSelection.worktreeId);
					setSelectedTabId?.(activeSelection.tabId);
				} else {
					setSelectedWorktreeId?.(null);
					setSelectedTabId?.(null);
				}

				// Close workspace selection modal if open
				setShowWorkspaceSelection(false);
			}
		} catch (error) {
			console.error("Failed to load workspace:", error);
		}
	};

	// Handle workspace selection from modal
	const handleWorkspaceSelectFromModal = async (workspaceId: string) => {
		await handleWorkspaceSelect(workspaceId);
	};

	// Handle create workspace from modal
	const handleCreateWorkspaceFromModal = async () => {
		// Trigger the open repository dialog
		window.ipcRenderer.send("open-repository");
	};

	// Load active workspace on mount
	useEffect(() => {
		const loadActiveWorkspace = async () => {
			try {
				setLoading(true);
				setError(null);

				const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");
				setWorkspaces(allWorkspaces);

				// Check if this window was restored from a previous session
				const isRestored = await window.ipcRenderer.invoke(
					"window-is-restored",
				);

				// Check for window-specific workspace first
				const workspaceId = await window.ipcRenderer.invoke(
					"workspace-get-window-workspace-id",
				);

				// If window doesn't have a workspace assigned, show selection modal
				// BUT only if this is a NEW window (not restored)
				// Restored windows without workspace should not show modal (user closed them)
				if (!workspaceId && !isRestored) {
					setShowWorkspaceSelection(true);
					return;
				}

				if (workspaceId) {
					const workspace = await window.ipcRenderer.invoke(
						"workspace-get",
						workspaceId,
					);

					if (workspace) {
						setCurrentWorkspace(workspace);
						// Set window-specific workspace
						await window.ipcRenderer.invoke(
							"workspace-set-window-workspace-id",
							workspaceId,
						);

						const activeSelection = await window.ipcRenderer.invoke(
							"workspace-get-active-selection",
							workspaceId,
						);

						if (activeSelection?.worktreeId && activeSelection?.tabId) {
							setSelectedWorktreeId?.(activeSelection.worktreeId);
							setSelectedTabId?.(activeSelection.tabId);
						}
					}
				} else if (!isRestored) {
					// No workspace selected and not restored - show selection modal
					setShowWorkspaceSelection(true);
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
			console.log("[MainScreen] Workspace opened event received:", workspace);
			setLoading(false);

			// Set window-specific workspace
			await window.ipcRenderer.invoke(
				"workspace-set-window-workspace-id",
				workspace.id,
			);
			// Also update global active workspace for backward compatibility
			await window.ipcRenderer.invoke(
				"workspace-set-active-workspace-id",
				workspace.id,
			);
			const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");
			setWorkspaces(allWorkspaces);

			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspace.id,
			);
			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
				// Close workspace selection modal if open
				setShowWorkspaceSelection(false);
			}
		};

		window.ipcRenderer.on("workspace-opened", handler);
		return () => {
			window.ipcRenderer.off("workspace-opened", handler);
		};
	}, []);

	return {
		workspaces,
		currentWorkspace,
		setCurrentWorkspace,
		setWorkspaces,
		loading,
		error,
		showWorkspaceSelection,
		setShowWorkspaceSelection,
		loadAllWorkspaces,
		handleWorkspaceSelect,
		handleWorkspaceSelectFromModal,
		handleCreateWorkspaceFromModal,
	};
}

