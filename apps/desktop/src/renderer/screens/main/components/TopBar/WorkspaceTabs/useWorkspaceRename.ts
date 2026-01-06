import { useEffect, useRef, useState } from "react";
import { useUpdateWorkspace } from "renderer/react-query/workspaces/useUpdateWorkspace";

export function useWorkspaceRename(workspaceId: string, workspaceName: string) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const updateWorkspace = useUpdateWorkspace();

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
			updateWorkspace.mutate({
				id: workspaceId,
				patch: { name: trimmedValue },
			});
		} else {
			setRenameValue(workspaceName);
		}
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
		inputRef,
		setRenameValue,
		startRename,
		submitRename,
		cancelRename,
		handleKeyDown,
	};
}
