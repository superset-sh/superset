import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useUpdateWorkspace } from "renderer/react-query/workspaces/useUpdateWorkspace";
import { useTabsStore } from "renderer/stores/tabs/store";
import { toast } from "@superset/ui/sonner";

export function useWorkspaceRename(
	workspaceId: string,
	workspaceName: string,
	branch: string,
	isWorktree: boolean = false
) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	const [pendingRename, setPendingRename] = useState<string | null>(null);
	const [pendingIsUnnamed, setPendingIsUnnamed] = useState<boolean>(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const updateWorkspace = useUpdateWorkspace();
	const updateWorkspacePaths = useTabsStore(s => s.updateWorkspacePaths);
	const trpcClient = electronTrpc.useUtils().client;

	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.select();
		}
	}, [isRenaming]);

	useEffect(() => {
		setRenameValue(workspaceName);
	}, [workspaceName]);

	const startRename = () => {
		setIsRenaming(true);
	};

	const submitRename = () => {
		const trimmedValue = renameValue.trim();
		const isCleared = !trimmedValue;

		if (isCleared) {
			if (isWorktree) {
				setPendingRename(branch);
				setPendingIsUnnamed(true);
			} else {
				updateWorkspace.mutate({
					id: workspaceId,
					patch: { name: branch, isUnnamed: true },
				});
				setRenameValue(branch);
				setIsRenaming(false);
			}
		} else if (trimmedValue !== workspaceName) {
			if (isWorktree) {
				setPendingRename(trimmedValue);
				setPendingIsUnnamed(false);
			} else {
				updateWorkspace.mutate({
					id: workspaceId,
					patch: { name: trimmedValue },
				});
				setIsRenaming(false);
			}
		} else {
			setRenameValue(workspaceName);
			setIsRenaming(false);
		}
	};

	const confirmRename = (renameFolder: boolean) => {
		if (pendingRename) {
			updateWorkspace.mutate({
				id: workspaceId,
				patch: { name: pendingRename, renameFolder, isUnnamed: pendingIsUnnamed ? true : undefined },
			}, {
				onSuccess: (data) => {
					if (data.renamedPaths) {
						updateWorkspacePaths(
							workspaceId,
							data.renamedPaths.oldPath,
							data.renamedPaths.newPath
						);
						// Kill all running terminal sessions for this workspace in the backend
						trpcClient.terminal.killDaemonSessionsForWorkspace.mutate({ workspaceId }).catch(console.error);
						setPendingRename(null);
						setIsRenaming(false);
					} else if (renameFolder) {
						// Folder rename was requested but failed
						toast.error("Failed to rename worktree folder. Only the workspace name was updated.");
					} else {
						// Folder rename was not requested, clear state
						setPendingRename(null);
						setIsRenaming(false);
					}
				}
			});
		}
	};

	const cancelPendingRename = () => {
		setPendingRename(null);
		setRenameValue(workspaceName);
		setIsRenaming(false);
	};

	const cancelRename = () => {
		setRenameValue(workspaceName);
		setIsRenaming(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			cancelRename();
		}
	};

	return {
		isRenaming,
		renameValue,
		pendingRename,
		inputRef,
		setRenameValue,
		startRename,
		submitRename,
		confirmRename,
		cancelPendingRename,
		cancelRename,
		handleKeyDown,
	};
}
