import { type MutableRefObject, useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory } from "shared/changes-types";
import type { CodeEditorAdapter } from "../../../../../components";

interface UseFileSaveParams {
	worktreePath: string;
	filePath: string;
	paneId: string;
	diffCategory?: ChangeCategory;
	editorRef: MutableRefObject<CodeEditorAdapter | null>;
	originalContentRef: MutableRefObject<string>;
	originalDiffContentRef: MutableRefObject<string>;
	draftContentRef: MutableRefObject<string | null>;
	setIsDirty: (dirty: boolean) => void;
}

export function useFileSave({
	worktreePath,
	filePath,
	paneId,
	diffCategory,
	editorRef,
	originalContentRef,
	originalDiffContentRef,
	draftContentRef,
	setIsDirty,
}: UseFileSaveParams) {
	const savingFromRawRef = useRef(false);
	const utils = electronTrpc.useUtils();

	const saveFileMutation = electronTrpc.changes.saveFile.useMutation({
		onSuccess: (result) => {
			if (result.status !== "saved") {
				savingFromRawRef.current = false;
				return;
			}

			setIsDirty(false);
			if (editorRef.current) {
				originalContentRef.current = editorRef.current.getValue();
			}
			if (savingFromRawRef.current) {
				draftContentRef.current = null;
			}
			savingFromRawRef.current = false;
			originalDiffContentRef.current = "";

			utils.changes.readWorkingFile.invalidate();
			utils.changes.getFileContents.invalidate();
			utils.changes.getStatus.invalidate();

			if (diffCategory === "staged") {
				const panes = useTabsStore.getState().panes;
				const currentPane = panes[paneId];
				if (currentPane?.fileViewer) {
					useTabsStore.setState({
						panes: {
							...panes,
							[paneId]: {
								...currentPane,
								fileViewer: {
									...currentPane.fileViewer,
									diffCategory: "unstaged",
								},
							},
						},
					});
				}
			}
		},
	});

	const handleSaveRaw = useCallback(
		async (options?: { force?: boolean }) => {
			if (!editorRef.current || !filePath || !worktreePath) return;
			savingFromRawRef.current = true;
			return saveFileMutation.mutateAsync({
				worktreePath,
				filePath,
				content: editorRef.current.getValue(),
				expectedContent: options?.force
					? undefined
					: originalContentRef.current,
			});
		},
		[worktreePath, filePath, saveFileMutation, editorRef, originalContentRef],
	);

	return {
		handleSaveRaw,
		isSaving: saveFileMutation.isPending,
	};
}
