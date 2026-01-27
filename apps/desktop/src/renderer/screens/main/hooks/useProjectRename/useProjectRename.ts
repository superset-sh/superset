import { useEffect, useState } from "react";
import { useUpdateProject } from "renderer/react-query/projects/useUpdateProject";

export function useProjectRename(projectId: string, projectName: string) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(projectName);
	const updateProject = useUpdateProject();

	useEffect(() => {
		setRenameValue(projectName);
	}, [projectName]);

	const startRename = () => {
		setIsRenaming(true);
	};

	const submitRename = () => {
		const trimmedValue = renameValue.trim();
		if (trimmedValue && trimmedValue !== projectName) {
			updateProject.mutate({
				id: projectId,
				patch: { name: trimmedValue },
			});
		} else {
			setRenameValue(projectName);
		}
		setIsRenaming(false);
	};

	const cancelRename = () => {
		setRenameValue(projectName);
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
		setRenameValue,
		startRename,
		submitRename,
		cancelRename,
		handleKeyDown,
	};
}
