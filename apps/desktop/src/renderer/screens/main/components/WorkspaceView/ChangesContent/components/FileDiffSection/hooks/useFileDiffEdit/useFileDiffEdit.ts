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
		onMutate: (variables) => {
			console.debug("[useFileDiffEdit] mutate", {
				filePath: variables.filePath,
				contentLength: variables.content.length,
				contentTail: variables.content.slice(-80),
			});
		},
		onSuccess: () => {
			console.debug("[useFileDiffEdit] success", {
				filePath,
			});
			utils.changes.getFileContents.invalidate();
			utils.changes.getStatus.invalidate();
		},
		onError: (error, variables) => {
			console.error("[useFileDiffEdit] error", {
				filePath: variables.filePath,
				contentLength: variables.content.length,
				contentTail: variables.content.slice(-80),
				error,
			});
		},
	});

	const handleSave = useCallback(
		(content: string) => {
			if (!worktreePath || !filePath) return;
			console.debug("[useFileDiffEdit] handleSave", {
				filePath,
				contentLength: content.length,
				contentTail: content.slice(-80),
			});
			saveFileMutation.mutate({ worktreePath, filePath, content });
		},
		[worktreePath, filePath, saveFileMutation],
	);

	const toggleEdit = editable ? () => setIsEditing((prev) => !prev) : undefined;

	return { isEditing, editable, toggleEdit, handleSave };
}
