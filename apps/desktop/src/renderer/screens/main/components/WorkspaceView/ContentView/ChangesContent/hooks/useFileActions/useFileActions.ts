import { trpc } from "renderer/lib/trpc";

interface UseFileActionsParams {
	worktreePath: string | undefined;
	filePath: string | undefined;
}

export function useFileActions({
	worktreePath,
	filePath,
}: UseFileActionsParams) {
	const utils = trpc.useUtils();

	const stageFile = trpc.changes.stageFile.useMutation({
		onSuccess: () => utils.changes.getStatus.invalidate(),
	});

	const unstageFile = trpc.changes.unstageFile.useMutation({
		onSuccess: () => utils.changes.getStatus.invalidate(),
	});

	const discardChanges = trpc.changes.discardChanges.useMutation({
		onSuccess: () => {
			utils.changes.getStatus.invalidate();
			utils.changes.getFileContents.invalidate();
		},
	});

	const deleteUntracked = trpc.changes.deleteUntracked.useMutation({
		onSuccess: () => {
			utils.changes.getStatus.invalidate();
			utils.changes.getFileContents.invalidate();
		},
	});

	const isPending =
		stageFile.isPending ||
		unstageFile.isPending ||
		discardChanges.isPending ||
		deleteUntracked.isPending;

	const stage = () => {
		if (!worktreePath || !filePath) return;
		stageFile.mutate({ worktreePath, filePath });
	};

	const unstage = () => {
		if (!worktreePath || !filePath) return;
		unstageFile.mutate({ worktreePath, filePath });
	};

	const discard = () => {
		if (!worktreePath || !filePath) return;
		discardChanges.mutate({ worktreePath, filePath });
	};

	const deleteFile = () => {
		if (!worktreePath || !filePath) return;
		deleteUntracked.mutate({ worktreePath, filePath });
	};

	return {
		stage,
		unstage,
		discard,
		deleteFile,
		isPending,
	};
}
