import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ChangeCategory } from "shared/changes-types";
import { isDiffEditable } from "shared/changes-types";

interface UseFileDiffEditParams {
	category: ChangeCategory;
	worktreePath: string;
	filePath: string;
}

export function useFileDiffEdit({
	category,
	worktreePath,
	filePath,
}: UseFileDiffEditParams) {
	const [isEditing, setIsEditing] = useState(false);
	const editable = isDiffEditable(category);

	const utils = electronTrpc.useUtils();
	const saveFileMutation = electronTrpc.changes.saveFile.useMutation({
		onSuccess: () => {
			utils.changes.getFileContents.invalidate();
			utils.changes.getStatus.invalidate();
		},
	});

	const handleSave = useCallback(
		(content: string) => {
			if (!worktreePath || !filePath) return;
			saveFileMutation.mutate({ worktreePath, filePath, content });
		},
		[worktreePath, filePath, saveFileMutation],
	);

	const toggleEdit = editable ? () => setIsEditing((prev) => !prev) : undefined;

	return { isEditing, editable, toggleEdit, handleSave };
}
