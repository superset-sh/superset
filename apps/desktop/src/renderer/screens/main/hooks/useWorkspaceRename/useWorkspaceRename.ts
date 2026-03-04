import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useUpdateWorkspace } from "renderer/react-query/workspaces/useUpdateWorkspace";
import { useTabsStore } from "renderer/stores/tabs/store";

export function useWorkspaceRename(workspaceId: string, workspaceName: string, isWorktree: boolean = false) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	const [pendingRename, setPendingRename] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const updateWorkspace = useUpdateWorkspace();
	const updateWorkspacePaths = useTabsStore(s => s.updateWorkspacePaths);
	const trpcClient = electronTrpc.useUtils().client;

	// Select input text when rename mode is activated
	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.select();
		}
	}, [isRenaming]);

	// Sync rename value when workspace name changes
	useEffect(() => {
		setRenameValue(workspaceName);
	}, [workspaceName]);

	const startRename = () => {
		setIsRenaming(true);
	};

	const submitRename = () => {
		const trimmedValue = renameValue.trim();
		if (trimmedValue && trimmedValue !== workspaceName) {
			if (isWorktree) {
				setPendingRename(trimmedValue);
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
				patch: { name: pendingRename, renameFolder },
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
					}
				}
			});
			setPendingRename(null);
			setIsRenaming(false);
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
